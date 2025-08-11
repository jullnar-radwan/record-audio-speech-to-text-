let ws, mediaStream, audioCtx, processor, source;
const startBtn = document.getElementById('startBtn');
const stopBtn  = document.getElementById('stopBtn');
const interimEl = document.getElementById('interim');
const finalEl   = document.getElementById('final');
const transEl   = document.getElementById('translation');
const langSel   = document.getElementById('language');
const trgSel    = document.getElementById('translateTarget');
const diarizeCB = document.getElementById('diarize');
const spkCount  = document.getElementById('spkCount');

function renderSpeakerTag(tag) {
  return `<span class="spk">متحدث ${tag}</span>`;
}

async function start() {
  startBtn.disabled = true;
  stopBtn.disabled = false;
  finalEl.textContent = '';
  interimEl.textContent = '';
  transEl.textContent = '';

  // 1) افتح الميكروفون
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  source = audioCtx.createMediaStreamSource(mediaStream);
  const sampleRate = audioCtx.sampleRate;

  // 2) WebSocket للباك-إند
  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${wsProto}://${location.hostname}:8080/stream`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'config',
      languageCode: langSel.value,
      sampleRate,
      translateTarget: trgSel.value || null,
      diarization: diarizeCB.checked,
      speakerCount: Number(spkCount.value || 2)
    }));
  };

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'transcript') {
      // interim
      if (!msg.isFinal) {
        if (msg.diarization && msg.words?.length) {
          // عرض كلمات مع المتحدث أثناء التدفق إن وُجدت
          const parts = msg.words.map(w => `${w.word}`).join(' ');
          interimEl.textContent = parts;
        } else {
          interimEl.textContent = msg.text;
        }
      } else {
        // final
        interimEl.textContent = '';
        if (msg.diarization && msg.words?.length) {
          // رندر نهائي مع المتحدثين
          const grouped = {};
          msg.words.forEach(w => {
            const tag = w.speakerTag || 0;
            grouped[tag] = grouped[tag] || [];
            grouped[tag].push(w.word);
          });
          let block = '';
          Object.keys(grouped).forEach(tag => {
            block += `${renderSpeakerTag(tag)} ${grouped[tag].join(' ')}\n`;
          });
          finalEl.innerHTML += block;
        } else {
          finalEl.textContent += msg.text + '\n';
        }

        if (msg.translation) {
          transEl.textContent += msg.translation + '\n';
        }
      }
    } else if (msg.type === 'error') {
      console.error(msg.error);
    }
  };

  ws.onerror = (e) => console.error('ws error', e);
  ws.onclose = () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };

  // 3) إرسال PCM16
  const bufferSize = 2048;
  processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  processor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== 1) return;
    const input = e.inputBuffer.getChannelData(0);
    const pcm16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    ws.send(pcm16.buffer);
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);
}

function stop() {
  stopBtn.disabled = true;
  startBtn.disabled = false;

  if (processor) { processor.disconnect(); processor = null; }
  if (source) { source.disconnect(); source = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (ws && ws.readyState === 1) ws.close();
}

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
