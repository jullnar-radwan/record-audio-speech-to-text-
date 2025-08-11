# record-audio-speech-to-text-
#  Google Cloud Speech-to-Text Streaming  
تطبيق ويب لتحويل الصوت إلى نص لحظيًا باستخدام **Google Cloud Speech-to-Text**، مع ميزات:  
- **تفريق المتحدثين** (Speaker Diarization)  
- **ترجمة فورية** (Google Cloud Translation)  
- **دعم العربية والإنجليزية**  
- نشر باستخدام **Docker** و **Render** أو **Cloud Run**  

---

## هيكلة المشروع 📂

<pre dir="ltr">speech-to-text-gcp/
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ client/
│  ├─ index.html
│  ├─ styles.css
│  └─ script.js
├─ server/
│  ├─ server.js
│  ├─ package.json
│  ├─ Dockerfile
│  └─ .env.example
├─ .gitignore
├─ .dockerignore
├─ render.yaml
└─ README.md
</pre>


## 🚀 تشغيل محليًا

### 1️⃣ تثبيت المتطلبات
- Node.js 18 أو أحدث
- حساب Google Cloud مفعّل عليه **Speech-to-Text API** و **Translation API**
- مفتاح خدمة (Service Account) بصلاحية:
  - `roles/speech.client`
  - `roles/cloudtranslate.user`

### 2️⃣ تجهيز المفتاح
حوّل مفتاح الخدمة (JSON) إلى Base64:
```bash
base64 -w0 key.json > key.b64.txt   # على macOS: base64 key.json > key.b64.txt
ضع القيمة في ملف .env داخل server/:
GCP_SA_KEY_BASE64=القيمة_التي_نسختها
DEFAULT_LANGUAGE=ar-SA
TRANSLATE_TARGET_DEFAULT=en
ENABLE_DIARIZATION_DEFAULT=true
DIARIZATION_MIN=2
DIARIZATION_MAX=6
 تثبيت وتشغيل
cd server
npm install
npm run dev
ثم افتح http://localhost:8080 في المتصفح.
التشغيل باستخدام Docker
docker build -t stt-app -f server/Dockerfile .
docker run --rm -p 8080:8080 \
  -e GCP_SA_KEY_BASE64="$(cat key.b64.txt)" \
  -v "$PWD/client":/app/client \
  stt-app
MIT © 2025
