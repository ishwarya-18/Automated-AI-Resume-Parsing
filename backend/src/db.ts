import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = path.resolve(__dirname, '../../database.sqlite');
  
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await dbInstance.run('PRAGMA foreign_keys = ON');
  
  return dbInstance;
}

export async function initDb() {
  const db = await getDb();

  // Create Users Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Admin', 'Recruiter', 'Candidate'))
    )
  `);

  // Create Candidates Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Candidates (
      candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      education TEXT,
      college TEXT,
      degree TEXT,
      cgpa REAL,
      experience_years REAL DEFAULT 0,
      skills TEXT, -- JSON array
      certifications TEXT, -- JSON array
      projects TEXT, -- JSON array
      github TEXT,
      linkedin TEXT,
      gender TEXT,
      age INTEGER,
      religion TEXT,
      caste TEXT,
      marital_status TEXT,
      address TEXT,
      application_status TEXT DEFAULT 'Applied' CHECK(application_status IN ('Applied', 'Under Review', 'Shortlisted', 'Rejected', 'Selected')),
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  // Set AUTOINCREMENT sequence start for Candidates
  // SQLite sets seq to highest ID. We will insert candidate rows starting from 1001.

  // Create Jobs Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Jobs (
      job_id INTEGER PRIMARY KEY AUTOINCREMENT,
      recruiter_id INTEGER NOT NULL,
      job_title TEXT NOT NULL,
      required_skills TEXT NOT NULL, -- JSON array
      preferred_skills TEXT NOT NULL, -- JSON array
      experience_required REAL DEFAULT 0,
      min_cgpa REAL DEFAULT 0,
      salary_range TEXT,
      location TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recruiter_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  // Create Resumes Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Resumes (
      resume_id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      parsed_data TEXT, -- JSON block
      FOREIGN KEY (candidate_id) REFERENCES Candidates(candidate_id) ON DELETE CASCADE
    )
  `);

  // Create Scores Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Scores (
      score_id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      match_score REAL DEFAULT 0,
      skill_score REAL DEFAULT 0,
      experience_score REAL DEFAULT 0,
      education_score REAL DEFAULT 0,
      project_score REAL DEFAULT 0,
      certification_score REAL DEFAULT 0,
      final_weighted_score REAL DEFAULT 0,
      rank INTEGER,
      comments TEXT,
      FOREIGN KEY (candidate_id) REFERENCES Candidates(candidate_id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES Jobs(job_id) ON DELETE CASCADE,
      UNIQUE(candidate_id, job_id)
    )
  `);

  // Create Reports Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Reports (
      report_id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      pdf_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (candidate_id) REFERENCES Candidates(candidate_id) ON DELETE CASCADE
    )
  `);

  // Seed data if empty
  const userCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM Users');
  if (userCount && userCount.count === 0) {
    console.log('Seeding database with initial users, candidates, and jobs...');

    const salt = await bcrypt.genSalt(10);
    const adminPassword = await bcrypt.hash('admin123', salt);
    const recruiterPassword = await bcrypt.hash('recruiter123', salt);
    const candidatePassword = await bcrypt.hash('candidate123', salt);

    // 1. Insert Users
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      1, 'System Admin', 'admin@example.com', adminPassword, 'Admin'
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      2, 'Tech Recruiter Sarah', 'recruiter@example.com', recruiterPassword, 'Recruiter'
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      3, 'John Doe (Candidate)', 'candidate1@example.com', candidatePassword, 'Candidate'
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      4, 'Jane Smith (Candidate)', 'candidate2@example.com', candidatePassword, 'Candidate'
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      5, 'Bob Johnson (Candidate)', 'candidate3@example.com', candidatePassword, 'Candidate'
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      6, 'Alice Williams (Candidate)', 'candidate4@example.com', candidatePassword, 'Candidate'
    );

    // 2. Insert Candidates with IDs starting at 1001 to look like Candidate #1001, etc.
    const candidatesSeed = [
      {
        candidate_id: 1001,
        user_id: 3,
        full_name: 'John Doe',
        email: 'candidate1@example.com',
        phone: '+1 (555) 019-2834',
        education: 'B.Tech in Computer Science',
        college: 'National Institute of Technology',
        degree: 'Bachelor of Technology',
        cgpa: 8.5,
        experience_years: 3.5,
        skills: JSON.stringify(['Java', 'SQL', 'React', 'Git', 'REST API', 'JavaScript', 'HTML', 'CSS']),
        certifications: JSON.stringify(['AWS Certified Cloud Practitioner', 'Oracle Java SE 11 Programmer']),
        projects: JSON.stringify([
          { name: 'E-commerce API', desc: 'Java Spring Boot project for shopping cart backend' },
          { name: 'Portfolio Website', desc: 'React static website with dark mode' }
        ]),
        github: 'https://github.com/johndoe',
        linkedin: 'https://linkedin.com/in/johndoe',
        gender: 'Male',
        age: 25,
        religion: 'Christianity',
        caste: 'General',
        marital_status: 'Single',
        address: '123 Main St, Seattle, WA',
        application_status: 'Applied'
      },
      {
        candidate_id: 1002,
        user_id: 4,
        full_name: 'Jane Smith',
        email: 'candidate2@example.com',
        phone: '+1 (555) 014-9821',
        education: 'M.Tech in Artificial Intelligence',
        college: 'Indian Institute of Technology',
        degree: 'Master of Technology',
        cgpa: 9.2,
        experience_years: 2.0,
        skills: JSON.stringify(['Python', 'SQL', 'Machine Learning', 'Deep Learning', 'NLP', 'Git', 'REST API']),
        certifications: JSON.stringify(['Google Professional Data Engineer', 'DeepLearning.AI TensorFlow Developer']),
        projects: JSON.stringify([
          { name: 'Resume Parser NLP', desc: 'Named Entity Recognition model for resume text extraction' },
          { name: 'Sentiment Classifier', desc: 'LSTM network to classify feedback' }
        ]),
        github: 'https://github.com/janesmith',
        linkedin: 'https://linkedin.com/in/janesmith',
        gender: 'Female',
        age: 26,
        religion: 'Hinduism',
        caste: 'OBC',
        marital_status: 'Single',
        address: '456 Tech Park, Bangalore, KA',
        application_status: 'Under Review'
      },
      {
        candidate_id: 1003,
        user_id: 5,
        full_name: 'Bob Johnson',
        email: 'candidate3@example.com',
        phone: '+1 (555) 018-3729',
        education: 'B.Sc in Computer Science',
        college: 'State University',
        degree: 'Bachelor of Science',
        cgpa: 7.8,
        experience_years: 5.0,
        skills: JSON.stringify(['Docker', 'Kubernetes', 'AWS', 'Python', 'Git', 'MySQL', 'REST API']),
        certifications: JSON.stringify(['AWS Certified Solutions Architect', 'Certified Kubernetes Administrator (CKA)']),
        projects: JSON.stringify([
          { name: 'DevOps Pipeline Automator', desc: 'CI/CD pipeline with GitHub Actions, Docker, and K8s' }
        ]),
        github: 'https://github.com/bobjohnson',
        linkedin: 'https://linkedin.com/in/bobjohnson',
        gender: 'Male',
        age: 28,
        religion: 'None',
        caste: 'General',
        marital_status: 'Married',
        address: '789 Cloud Ave, Austin, TX',
        application_status: 'Shortlisted'
      },
      {
        candidate_id: 1004,
        user_id: 6,
        full_name: 'Alice Williams',
        email: 'candidate4@example.com',
        phone: '+1 (555) 012-7491',
        education: 'B.E. in Information Technology',
        college: 'Delhi Technological University',
        degree: 'Bachelor of Engineering',
        cgpa: 8.9,
        experience_years: 1.2,
        skills: JSON.stringify(['React', 'HTML', 'CSS', 'JavaScript', 'Tailwind', 'Git', 'MongoDB']),
        certifications: JSON.stringify(['Meta Front-End Developer Professional Certificate']),
        projects: JSON.stringify([
          { name: 'Admin Dashboard', desc: 'Vite React dashboard with interactive graphs' },
          { name: 'Chat Web App', desc: 'Real-time chat client using Socket.io and React' }
        ]),
        github: 'https://github.com/alicewilliams',
        linkedin: 'https://linkedin.com/in/alicewilliams',
        gender: 'Female',
        age: 23,
        religion: 'Hinduism',
        caste: 'General',
        marital_status: 'Single',
        address: '101 Sector 4, Noida, UP',
        application_status: 'Selected'
      }
    ];

    for (const c of candidatesSeed) {
      await db.run(`
        INSERT INTO Candidates (
          candidate_id, user_id, full_name, email, phone, education, college, degree, cgpa, 
          experience_years, skills, certifications, projects, github, linkedin, 
          gender, age, religion, caste, marital_status, address, application_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        c.candidate_id, c.user_id, c.full_name, c.email, c.phone, c.education, c.college, c.degree, c.cgpa,
        c.experience_years, c.skills, c.certifications, c.projects, c.github, c.linkedin,
        c.gender, c.age, c.religion, c.caste, c.marital_status, c.address, c.application_status
      ]);
    }

    // 3. Insert Jobs
    const jobsSeed = [
      {
        job_id: 1,
        recruiter_id: 2,
        job_title: 'Full Stack Java & Cloud Engineer',
        required_skills: JSON.stringify(['Java', 'SQL', 'Spring Boot', 'AWS', 'Docker']),
        preferred_skills: JSON.stringify(['React', 'Git', 'REST API']),
        experience_required: 3.0,
        min_cgpa: 8.0,
        salary_range: '$90,000 - $120,000',
        location: 'Seattle, WA (Hybrid)'
      },
      {
        job_id: 2,
        recruiter_id: 2,
        job_title: 'AI / Machine Learning Engineer',
        required_skills: JSON.stringify(['Python', 'SQL', 'Machine Learning', 'Deep Learning', 'NLP']),
        preferred_skills: JSON.stringify(['Docker', 'Kubernetes', 'Git']),
        experience_required: 2.0,
        min_cgpa: 8.5,
        salary_range: '$110,000 - $140,000',
        location: 'Remote, US'
      },
      {
        job_id: 3,
        recruiter_id: 2,
        job_title: 'DevOps & Platform Specialist',
        required_skills: JSON.stringify(['Docker', 'Kubernetes', 'AWS', 'Git', 'Python']),
        preferred_skills: JSON.stringify(['MySQL', 'REST API']),
        experience_required: 4.0,
        min_cgpa: 7.0,
        salary_range: '$100,000 - $130,000',
        location: 'Austin, TX (On-site)'
      },
      {
        job_id: 4,
        recruiter_id: 2,
        job_title: 'Frontend React Developer',
        required_skills: JSON.stringify(['React', 'HTML', 'CSS', 'JavaScript', 'Git']),
        preferred_skills: JSON.stringify(['MongoDB', 'Tailwind']),
        experience_required: 1.0,
        min_cgpa: 7.5,
        salary_range: '$75,000 - $95,000',
        location: 'Noida, UP (Hybrid)'
      }
    ];

    for (const j of jobsSeed) {
      await db.run(`
        INSERT INTO Jobs (
          job_id, recruiter_id, job_title, required_skills, preferred_skills, 
          experience_required, min_cgpa, salary_range, location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        j.job_id, j.recruiter_id, j.job_title, j.required_skills, j.preferred_skills,
        j.experience_required, j.min_cgpa, j.salary_range, j.location
      ]);
    }

    console.log('Database seeded successfully.');
  }
}
