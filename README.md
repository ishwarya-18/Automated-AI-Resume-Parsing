# Automated AI Resume Parsing & Skill-Validation Platform with Bias-Mitigating Screening Protocols

An advanced, full-stack recruitment screening application engineered as a **Final-Year Engineering Major Project**. The platform utilizes structured Natural Language Processing (NLP) to parse candidate resumes, calculates matching scores against job descriptions using custom weighting algorithms, and enforces bias mitigation through dynamic demographic data masking during evaluations.

---

## 🌟 Core Engineered Modules

1. **AI Resume NLP Parser Sandbox**:
   * Extracts candidate details, contact info, experience length, education degrees, CGPA, and technical/soft skills from plain text or uploaded files (PDF/DOCX).
2. **Bias Mitigation Protocol (Dynamic Redaction)**:
   * Masks sensitive candidate identifiers (Name, Email, Phone, Gender, Age, Religion, Caste, Marital Status, Location) for recruiters under "Anonymous Screening Mode".
   * Unmask reveal audit logs are stored securely for administrative accountability.
3. **Dynamic Ranking Engine**:
   * Evaluates candidates based on requirements using a customizable weighted scoring algorithm:
     $$\text{Final Match Score} = w_1\text{Skills} + w_2\text{Experience} + w_3\text{Education} + w_4\text{Projects} + w_5\text{Certifications}$$
4. **Analytics & Reports Panel**:
   * Displays SVG-based interactive hiring funnels, skill distribution histograms, and overall candidate rankings.
   * Generates printable PDF-friendly report views and downloadable CSV rankings.
5. **AI Recruiter Assistant Chatbot**:
   * Slide-out conversational widget that parses requirements, suggests optimization tips, and tracks pipeline statuses.

---

## 🛠️ Technology Stack

* **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v3, Custom SVG Charts
* **Backend**: Node.js, Express, TypeScript, JWT (JSON Web Tokens), Multer (File uploads)
* **Database**: SQLite (File-based relational storage using `sqlite3` driver)
* **NLP Parsing Engine**: RegExp tokenizers, string-similarity matching, `pdf-parse`, and `mammoth` (DOCX parser)

---

## 📂 Project Structure

```
ai-resume-screener/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── nlpParser.ts      # NLP Text Extraction algorithms
│   │   │   └── scoreEngine.ts    # Weighted scoring match calculator
│   │   ├── db.ts                 # SQLite relational schema & seed operations
│   │   ├── index.ts              # Express API controller routes & JWT guards
│   │   └── test-backend.ts       # Backend verification tests
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main layout, portals, dashboards & chatbot
│   │   ├── main.tsx
│   │   └── style.css             # Tailwind imports
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── database.sqlite               # Local relational database
├── deployment_guide.md           # Instructions for cloud hosting (Render/Vercel)
└── README.md
```

---

## 🚀 How to Set Up and Run Locally

Ensure you have **Node.js (v18+)** installed.

### 1. Set Up the Backend API
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Initialize the database and start the server:
   ```bash
   npm run dev
   ```
   *The server will initialize the local `database.sqlite` file, apply migrations, seed dummy data, and run on `http://localhost:5001`.*

### 2. Set Up the Frontend App
1. Open a second terminal window and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the hot-reloading development server:
   ```bash
   npm run dev
   ```
   *Open [http://localhost:3000](http://localhost:3000) in your browser.*

---

## 🔑 Developer Test Credentials

You can log into different portals using the pre-seeded accounts:

* **Recruiter Portal**: 
  * Email: `recruiter@example.com`
  * Password: `recruiter123`
* **Candidate Portal**: 
  * Email: `candidate1@example.com`
  * Password: `candidate123`
* **Admin Terminal**: 
  * Email: `admin@example.com`
  * Password: `admin123`

---

## ☁️ Production Cloud Deployment
To deploy this project to the web, refer to the step-by-step instructions in [deployment_guide.md](file:///C:/Users/ishwa/.gemini/antigravity/scratch/ai-resume-screener/deployment_guide.md) (uses Vercel for Frontend and Render/PostgreSQL for Backend).
