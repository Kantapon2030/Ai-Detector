# พลิกเกมกลโกง (EduGuard AI) - คู่มือการติดตั้งและทดสอบในเครื่องคอมพิวเตอร์

แอปพลิเคชันสำหรับตรวจสอบความโปร่งใสของข้อมูล โดยใช้ Gemini AI ในการวิเคราะห์ความเป็นมนุษย์ vs AI

## 🛠️ สิ่งที่ต้องเตรียม (Prerequisites)

1.  **Node.js**: เวอร์ชัน 18 ขึ้นไป
2.  **Firebase Project**: สำหรับฐานข้อมูล Firestore และ Authentication
3.  **Gemini API Key**: สำหรับการประมวลผล AI (ขอได้จาก [Google AI Studio](https://aistudio.google.com/))

## 🚀 ขั้นตอนการติดตั้ง (Installation)

1.  **ดาวน์โหลดโค้ด**: ดาวน์โหลดไฟล์โปรเจกต์ทั้งหมดลงในเครื่องของคุณ
2.  **ติดตั้ง Dependencies**:
    ```bash
    npm install
    ```
3.  **ตั้งค่า Environment Variables**:
    *   คัดลอกไฟล์ `.env.example` และเปลี่ยนชื่อเป็น `.env`
    *   ใส่ค่าที่จำเป็นลงในไฟล์ `.env`:
        *   `GEMINI_API_KEY`: คีย์จาก Google AI Studio
        *   `VITE_FIREBASE_*`: ข้อมูลจาก Firebase Console (Project Settings -> General -> Your apps)

## 🔥 การรันแอปพลิเคชัน (Running the App)

1.  **รันในโหมดพัฒนา (Development)**:
    ```bash
    npm run dev
    ```
    แอปพลิเคชันจะรันที่ `http://localhost:3000`

2.  **การสร้างไฟล์สำหรับ Production (Build)**:
    ```bash
    npm run build
    ```
    ไฟล์จะถูกสร้างในโฟลเดอร์ `dist/`

## 📁 โครงสร้างโปรเจกต์

*   `src/pages/PublicHome.tsx`: หน้าหลักสำหรับผู้ใช้ทั่วไป (ส่งข้อมูลตรวจสอบ)
*   `src/pages/AdminDashboard.tsx`: หน้าสำหรับผู้ดูแลระบบ (จัดการข้อมูลและ Dispute)
*   `src/firebase.ts`: การตั้งค่าการเชื่อมต่อ Firebase
*   `src/components/`: คอมโพเนนต์ UI ต่างๆ เช่น GaugeMeter, Logo

## 🛡️ การตั้งค่า Firebase Security Rules

เพื่อให้ระบบทำงานได้อย่างถูกต้อง คุณควรตั้งค่า Security Rules ใน Firebase Console ดังนี้:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // อนุญาตให้ทุกคนส่งข้อมูลตรวจสอบได้ (Anonymous)
    match /submissions/{submissionId} {
      allow create: if true;
      allow read, update: if request.auth != null;
    }
    
    // ผลการวิเคราะห์
    match /analysisResults/{resultId} {
      allow read: if true;
      allow create: if true;
    }
    
    // รูปแบบการทุจริต (สำหรับ RAG)
    match /patterns/{patternId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## 📝 หมายเหตุ

*   หากรันในเครื่องคอมพิวเตอร์ (Local) ระบบจะใช้ค่าจากไฟล์ `.env` เป็นหลัก
*   หากรันบน AI Studio ระบบจะดึงค่าจาก `firebase-applet-config.json` โดยอัตโนมัติ
