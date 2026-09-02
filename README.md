# พลิกเกมกลโกง (EduGuard AI) - OpenTyphoon 2.5 AI Detector

แอปพลิเคชันตรวจจับและวิเคราะห์เนื้อหาที่สร้างโดยปัญญาประดิษฐ์ (AI-Generated Text Detection) ขับเคลื่อนด้วยโมเดล **OpenTyphoon AI (Typhoon 2.5 30B Instruct)** พร้อมสถาปัตยกรรมภาษาศาสตร์คอมพิวเตอร์ (Stylometry & Perplexity), Human-in-the-Loop RAG Learning Loop และระบบ Live API Health Check

---

## 🛠️ สิ่งที่ต้องเตรียม (Prerequisites)

1. **Node.js**: เวอร์ชัน 18, 20, 22 หรือใหม่กว่า
2. **OpenTyphoon API Key**: สมัครและรับคีย์ได้ที่ [OpenTyphoon.ai Dashboard](https://opentyphoon.ai/)
3. **Firebase Project**: สำหรับ Firestore Database และ Google Authentication

---

## 🚀 ขั้นตอนการติดตั้งและรันในเครื่อง (Local Setup)

1. **ติดตั้ง Dependencies**:
   ```bash
   npm install
   ```

2. **ตั้งค่า Environment Variables (`.env`)**:
   คัดลอกไฟล์ `.env.example` เป็น `.env` และกรอกข้อมูล:
   ```env
   # OpenTyphoon API Key
   TYPHOON_API_KEY=sk-zNqiSPVXV8du6jHQwYlLMXVV8wSzKdqJUc1gUbamxj36pGJg

   # Firebase Configuration
   VITE_FIREBASE_API_KEY=AIzaSyCDgEGqylXo-NU1yip4qalX3HsiuFZXd6g
   VITE_FIREBASE_AUTH_DOMAIN=gen-lang-client-0142301675.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=gen-lang-client-0142301675
   VITE_FIREBASE_STORAGE_BUCKET=gen-lang-client-0142301675.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=438619356596
   VITE_FIREBASE_APP_ID=1:438619356596:web:431b9141e1e47de05a46e1
   VITE_FIREBASE_DATABASE_ID=ai-studio-84489240-2857-4892-83b3-f9256a68e7c6
   PORT=3000
   ```

3. **รันเซิร์ฟเวอร์ในโหมดพัฒนา (Development)**:
   ```bash
   npm run dev
   ```
   เข้าใช้งานได้ที่ `http://localhost:3000` (พร้อมใช้งานทันที 0ms)

---

## ☁️ การ Deploy บน Render (Free Tier)

โปรเจกต์นี้มีไฟล์ [`render.yaml`](./render.yaml) พร้อมสำหรับการ Deploy บน **Render Free Web Service** ทันที

### ขั้นตอนการ Deploy:
1. Push โค้ดนี้ขึ้น GitHub Repository
2. เข้าสู่ระบบ [Render Dashboard](https://dashboard.render.com/) -> กด **New +** -> เลือก **Web Service** (หรือเลือก **Blueprint** แล้วชี้มาที่ repo นี้)
3. ตั้งค่าการ Build และ Start:
   - **Environment**: `Node`
   - **Plan**: `Free`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. ตั้งค่า **Environment Variables** ใน Render:
   - `NODE_ENV`: `production`
   - `PORT`: `3000` (Render จะผูกพอร์ตให้อัตโนมัติ)
   - `TYPHOON_API_KEY`: ใส่คีย์ OpenTyphoon ของคุณ (จะถูกเก็บไว้เป็น Secret ฝั่งเซิร์ฟเวอร์ ไม่หลุดออกไปหน้าบ้าน)
   - `VITE_FIREBASE_*`: ใส่ค่าคอนฟิก Firebase

---

## 🛡️ ความปลอดภัยและการจัดการคีย์ (Security & Key Management)

- **API Key ซ่อนหลังบ้าน 100%**: ทุกคำขอตรวจจับ AI จะส่งผ่าน Backend Proxy (`/api/analyze-typhoon`) ทำให้ `TYPHOON_API_KEY` ไม่เคยถูกเปิดเผยสู่เบราว์เซอร์ของผู้ใช้
- **Firebase Security Rules**: ปกป้องฐานข้อมูล Firestore ให้อนุญาตการส่งข้อมูลตรวจสอบ และจำกัดสิทธิ์การลบ/แก้ไขให้เฉพาะแอดมิน (`tawna20081@gmail.com`) เท่านั้น

---

## 🧠 สถาปัตยกรรมภาษาศาสตร์และ Prompt ตรวจจับ AI (Stylometry Dimensions)

ระบบใช้หลักการประเมิน 3 มิติเพื่อความแม่นยำสูงสุด:
1. **Perplexity & Burstiness**: ตรวจจับความสมมาตรและความแปรผันของจังหวะความยาวประโยค
2. **Discourse Patterns & Clichés**: ตรวจจับคำเชื่อมและสำนวนสำเร็จรูปที่ AI มักใช้ซ้ำ (เช่น *"ในยุคปัจจุบัน...", "นอกจากนี้...", "สิ่งสำคัญคือ...", "มีบทบาทสำคัญอย่างยิ่ง", "โดยสรุปแล้ว..."*)
3. **Semantic Depth & Tone**: ตรวจสอบความเป็นกลางเกินจริง (Sterility) เทียบกับอารมณ์และสำนวนภาษาพูดธรรมชาติของมนุษย์
4. **Sentence-Level Heatmap**: ไฮไลต์ประโยคแยกตามโอกาสความเป็น AI (0-100%) เพื่อความโปร่งใสและตรวจสอบง่าย
