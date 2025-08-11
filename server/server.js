import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { v1p1beta1 as speechV1p1 } from '@google-cloud/speech';
import { TranslationServiceClient } from '@google-cloud/translate';
import fs from 'fs';
import os from 'os';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.static(path.join(process.cwd(), 'client')));
const PORT = process.env.PORT || 8080;

/** ───────────────── مفاتيح Google من Secrets ───────────────── **/
let credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath) {
  const b64 = process.env.GCP_SA_KEY_BASE64 || '';
  if (!b64) {
    console.warn('⚠️ GCP_SA_KEY_BASE64 غير موجود — ضع المفتاح في Secrets أو .env');
  } else {
    const json = Buffer.from(b64, 'base64').toString('utf-8');
    const tmp = path.join(os.tmpdir(), 'gcp-key.json');
    fs.writeFileSync(tmp, json);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmp;
    credsPath = tmp;
    console.log('✅ GOOGLE_APPLICATION_CREDENTIALS ->', tmp);
  }
}

/** ───────────────── عملاء Google ───────────────── **/
const speech = new speechV1p1.SpeechClient();
const translate = new TranslationServiceClient();

/** ───────────────── HTTP + WS ───────────────── **/
const server = app.listen(PORT, () => {
  console.log(`HTTP on http://localhost:${PORT}`);
});
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws) => {
  let recognizeStream = null;

  // قيم افتراضية
  let languageCode = process.env.DEFAULT_LANGUAGE || 'ar-SA';
  let sampleRateHertz = 44100;
  let translateTarget = process.env.TRANSLATE_TARGET_DEFAULT || '';
  let diarization = (process.env.ENABLE_DIARIZATION_DEFAULT || 'false') === 'true';
  let speakerCount = Number(process.env.DIARIZATION_MIN || 2);
  const diarMin = Number(process.env.DIARIZATION_MIN || 2);
  const diarMax = Number(process.env.DIARIZATION_MAX || 8);

  const startStream = () => {
    if (recognizeStream) {
      recognizeStream.removeAllListeners();
      recognizeStream.destroy();
      recognizeStream = null;
    }

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz,
      languageCode,
      enableAutomaticPunctuation: true,
      model: 'default',
      // Diarization
      diarizationConfig: diarization
        ? {
            enableSpeakerDiarization: true,
            minSpeakerCount: Math.max(diarMin, Math.min(speakerCount || diarMin, diarMax)),
            maxSpeakerCount: Math.max(diarMin, Math.min(Math.max(speakerCount, diarMin), diarMax))
          }
        : undefined,
    };

    recognizeStream = speech.streamingRecognize({
      config,
      interimResults: true
    })
    .on('error', (err) => {
      ws.send(JSON.stringify({ type: 'error', error: err.message }));
    })
    .on('data', async (data) => {
      const results = data.results?.[0];
      if (!results) return;
      const alt = results.alternatives?.[0];
      if (!alt) return;

      // الرد الأساسي
      const payload = {
        type: 'transcript',
        text: alt.transcript || '',
        isFinal: results.isFinal === true
      };

      // كلمات + speakerTag لو متاح
      if (diarization && alt.words?.length) {
        payload.diarization = true;
        payload.words = alt.words.map(w => ({
          word: w.word,
          start: w.startTime?.seconds || 0,
          end: w.endTime?.seconds || 0,
          speakerTag: w.speakerTag || 0
        }));
      }

      // ترجمة (للنهائي فقط حتى تكون أنظف)
      if (payload.isFinal && translateTarget) {
        try {
          const [resp] = await translate.translateText({
            parent: `projects/${await getProjectId()}/locations/global`,
            contents: [payload.text],
            targetLanguageCode: translateTarget
          });
          const translated = resp?.translations?.[0]?.translatedText;
          if (translated) payload.translation = translated;
        } catch (e) {
          // لا توقف الاستماع بسبب خطأ ترجمة
          console.warn('Translation error:', e.message);
        }
      }

      ws.send(JSON.stringify(payload));
    });
  };

  ws.on('message', (msg) => {
    // أول رسالة: CONFIG
    if (!recognizeStream) {
      try {
        const cfg = JSON.parse(msg.toString('utf8'));
        if (cfg?.type === 'config') {
          languageCode = cfg.languageCode || languageCode;
          sampleRateHertz = Math.round(cfg.sampleRate || sampleRateHertz);
          translateTarget = cfg.translateTarget || '';
          diarization = !!cfg.diarization;
          speakerCount = Number(cfg.speakerCount || speakerCount);
          startStream();
          return;
        }
      } catch {
        // بقية الرسائل باينري للصوت
      }
    }
    if (recognizeStream) recognizeStream.write(msg);
  });

  ws.on('close', () => {
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream.removeAllListeners();
      recognizeStream = null;
    }
  });
});

/** Helper: احصل على projectId من الاعتماد */
async function getProjectId() {
  // Speech/Translate كلاهما يعيدان projectId من env
  try {
    return await speech.getProjectId();
  } catch {
    // fallback
    return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }
}
