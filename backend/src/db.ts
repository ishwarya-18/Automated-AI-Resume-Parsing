import path from 'path';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { calculateMatchScore } from './services/scoreEngine';

export interface DatabaseWrapper {
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  run(sql: string, params?: any[]): Promise<{ lastID?: number; changes?: number }>;
  exec(sql: string): Promise<void>;
}

let dbInstance: DatabaseWrapper | null = null;
let isPostgres = false;

export async function getDb(): Promise<DatabaseWrapper> {
  if (dbInstance) {
    return dbInstance;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    console.log('Connecting to PostgreSQL Cloud Database...');
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false } // Required for Supabase/Render SSL connections
    });
    dbInstance = new PgWrapper(pool);
    isPostgres = true;
  } else {
    console.log('Connecting to Local SQLite Database...');
    const sqlite3 = require('sqlite3');
    const { open } = require('sqlite');
    const dbPath = path.resolve(__dirname, '../../database.sqlite');
    const sqliteDb = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Enable foreign keys in SQLite
    await sqliteDb.run('PRAGMA foreign_keys = ON');
    
    dbInstance = new SqliteWrapper(sqliteDb);
    isPostgres = false;
  }

  return dbInstance;
}

class SqliteWrapper implements DatabaseWrapper {
  constructor(private db: any) {}
  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.db.get(sql, params);
  }
  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.db.all(sql, params);
  }
  async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    const res = await this.db.run(sql, params);
    return { lastID: res.lastID, changes: res.changes };
  }
  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }
}

class PgWrapper implements DatabaseWrapper {
  constructor(private pool: Pool) {}

  private translate(sql: string): string {
    let newSql = sql;
    
    // Skip SQLite Pragmas
    if (newSql.trim().toUpperCase().startsWith('PRAGMA')) {
      return 'SELECT 1';
    }

    // Replace table names with double quotes for case sensitivity
    const tables = ['Users', 'Candidates', 'Jobs', 'Resumes', 'Scores', 'Reports'];
    for (const t of tables) {
      const regex = new RegExp(`\\b${t}\\b`, 'g');
      newSql = newSql.replace(regex, `"${t}"`);
    }

    // Replace AUTOINCREMENT
    newSql = newSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

    // Replace SQLite parameter placeholders (?) with Postgres placeholders ($1, $2...)
    let idx = 1;
    newSql = newSql.replace(/\?/g, () => `$${idx++}`);

    // Replace standard time functions
    newSql = newSql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
    newSql = newSql.replace(/datetime\('now', 'localtime'\)/gi, 'CURRENT_TIMESTAMP');

    // Replace DATETIME with TIMESTAMP
    newSql = newSql.replace(/\bDATETIME\b/gi, 'TIMESTAMP');

    return newSql;
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const translated = this.translate(sql);
    const res = await this.pool.query(translated, params);
    return res.rows[0];
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const translated = this.translate(sql);
    const res = await this.pool.query(translated, params);
    return res.rows;
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    let translated = this.translate(sql);

    // Append RETURNING for insert statements to fetch last insert ID
    if (translated.trim().toUpperCase().startsWith('INSERT ')) {
      if (translated.includes('"Candidates"')) {
        translated += ' RETURNING candidate_id';
      } else if (translated.includes('"Users"')) {
        translated += ' RETURNING id';
      } else if (translated.includes('"Jobs"')) {
        translated += ' RETURNING job_id';
      } else if (translated.includes('"Resumes"')) {
        translated += ' RETURNING resume_id';
      } else if (translated.includes('"Scores"')) {
        translated += ' RETURNING score_id';
      } else if (translated.includes('"Reports"')) {
        translated += ' RETURNING report_id';
      }
    }

    const res = await this.pool.query(translated, params);
    const lastID = res.rows[0] ? Object.values(res.rows[0])[0] as number : undefined;
    return { lastID, changes: res.rowCount || 0 };
  }

  async exec(sql: string): Promise<void> {
    const translated = this.translate(sql);
    await this.pool.query(translated);
  }
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
      skill_validation TEXT,
      resume_suggestions TEXT,
      quality_score TEXT,
      resume_hash TEXT,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  // Create Jobs Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Jobs (
      job_id INTEGER PRIMARY KEY AUTOINCREMENT,
      recruiter_id INTEGER NOT NULL,
      job_title TEXT NOT NULL,
      required_skills TEXT NOT NULL,
      preferred_skills TEXT NOT NULL,
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
      parsed_data TEXT,
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
      status TEXT CHECK(status IN ('Applied', 'Under Review', 'Shortlisted', 'Rejected', 'Selected')),
      applied_at TIMESTAMP,
      explainable_ai TEXT,
      fairness_report TEXT,
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

  // Create AuditLogs Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS AuditLogs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      admin_name TEXT,
      candidate_id INTEGER,
      candidate_name TEXT,
      reason TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed data if empty
  const userCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM Users');
  if (userCount && Number(userCount.count) === 0) {
    console.log('Seeding database with initial users, candidates, and jobs...');

    const salt = await bcrypt.genSalt(10);
    const adminPassword = await bcrypt.hash('admin123', salt);
    const recruiterPassword = await bcrypt.hash('recruiter123', salt);
    const candidatePassword = await bcrypt.hash('candidate123', salt);

    // 1. Insert Users
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [1, 'System Admin', 'admin@example.com', adminPassword, 'Admin']
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [2, 'Tech Recruiter Sarah', 'recruiter@example.com', recruiterPassword, 'Recruiter']
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [3, 'John Doe (Candidate)', 'candidate1@example.com', candidatePassword, 'Candidate']
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [4, 'Jane Smith (Candidate)', 'candidate2@example.com', candidatePassword, 'Candidate']
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [5, 'Bob Johnson (Candidate)', 'candidate3@example.com', candidatePassword, 'Candidate']
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [6, 'Alice Williams (Candidate)', 'candidate4@example.com', candidatePassword, 'Candidate']
    );

    // 2. Insert Candidates
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
        application_status: 'Applied',
        skill_validation: JSON.stringify([
          { skill: 'Java', confidence: 95, evidence: ['Project: E-commerce API', 'Oracle Certification'], status: 'Verified' },
          { skill: 'React', confidence: 90, evidence: ['Project: Portfolio Website'], status: 'Verified' },
          { skill: 'SQL', confidence: 90, evidence: ['Project: E-commerce API'], status: 'Verified' },
          { skill: 'AWS', confidence: 95, evidence: ['Certification: AWS Cloud Practitioner'], status: 'Verified' },
          { skill: 'REST API', confidence: 90, evidence: ['Project: E-commerce API'], status: 'Verified' },
          { skill: 'Python', confidence: 25, evidence: ['Only listed in skills section'], status: 'Needs Validation' }
        ]),
        resume_suggestions: JSON.stringify({
          strengths: ['Strong Java & Spring Boot project evidence', 'Industry-recognized certifications'],
          weaknesses: ['No cloud deployment metrics shown', 'Missing containerization details'],
          recommendations: ['Integrate Docker configuration details in projects', 'Add system metrics (e.g. latency, throughput) to your E-commerce API description']
        }),
        quality_score: JSON.stringify({ grammar: 94, formatting: 95, projects: 88, skills: 92, overall: 92 }),
        resume_hash: 'hash_john_doe'
      },
      {
        candidate_id: 1002,
        user_id: 4,
        full_name: 'Jane Smith',
        email: 'candidate2@example.com',
        phone: '+1 (555) 018-4921',
        education: 'M.S. in Data Science',
        college: 'Stanford University',
        degree: 'Master of Science',
        cgpa: 9.2,
        experience_years: 2.0,
        skills: JSON.stringify(['Python', 'SQL', 'Machine Learning', 'Deep Learning', 'NLP', 'TensorFlow', 'Git']),
        certifications: JSON.stringify(['Google Cloud Professional Data Engineer']),
        projects: JSON.stringify([
          { name: 'Financial Forecaster', desc: 'Predictive analytics pipeline using LSTM neural networks' }
        ]),
        github: 'https://github.com/janesmith',
        linkedin: 'https://linkedin.com/in/janesmith',
        gender: 'Female',
        age: 26,
        religion: 'None',
        caste: 'General',
        marital_status: 'Single',
        address: '456 Tech Park, Bangalore, KA',
        application_status: 'Under Review',
        skill_validation: JSON.stringify([
          { skill: 'Python', confidence: 95, evidence: ['Project: Financial Forecaster'], status: 'Verified' },
          { skill: 'Machine Learning', confidence: 90, evidence: ['Project: Financial Forecaster'], status: 'Verified' },
          { skill: 'Deep Learning', confidence: 90, evidence: ['Project: Financial Forecaster'], status: 'Verified' },
          { skill: 'GCP', confidence: 95, evidence: ['Certification: Google Cloud Professional Data Engineer'], status: 'Verified' },
          { skill: 'SQL', confidence: 20, evidence: ['Only listed in skills section'], status: 'Needs Validation' }
        ]),
        resume_suggestions: JSON.stringify({
          strengths: ['High GPA from top-tier academic institute', 'Deep neural network project evidence'],
          weaknesses: ['Only 2 years professional experience', 'Relational database details not showcased'],
          recommendations: ['Build a secondary project detailing SQL/NoSQL databases', 'Incorporate Cloud storage throughput details in ML projects']
        }),
        quality_score: JSON.stringify({ grammar: 90, formatting: 92, projects: 85, skills: 90, overall: 89 }),
        resume_hash: 'hash_jane_smith'
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
        application_status: 'Shortlisted',
        skill_validation: JSON.stringify([
          { skill: 'Docker', confidence: 95, evidence: ['Project: DevOps Pipeline Automator', 'Certification: CKA'], status: 'Verified' },
          { skill: 'Kubernetes', confidence: 95, evidence: ['Project: DevOps Pipeline Automator', 'Certification: CKA'], status: 'Verified' },
          { skill: 'AWS', confidence: 95, evidence: ['Certification: AWS Solutions Architect'], status: 'Verified' },
          { skill: 'Git', confidence: 90, evidence: ['Project: DevOps Pipeline Automator'], status: 'Verified' },
          { skill: 'Python', confidence: 30, evidence: ['Only listed in skills section'], status: 'Needs Validation' }
        ]),
        resume_suggestions: JSON.stringify({
          strengths: ['Exceptional DevOps validation (CKA + AWS SA)', '5 years professional experience'],
          weaknesses: ['No frontend dashboard exposure', 'Relational database details are basic'],
          recommendations: ['Build a monitoring dashboard project utilizing Grafana/Prometheus', 'Incorporate IaC (Terraform) experience in projects']
        }),
        quality_score: JSON.stringify({ grammar: 96, formatting: 94, projects: 93, skills: 96, overall: 95 }),
        resume_hash: 'hash_bob_johnson'
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
        application_status: 'Selected',
        skill_validation: JSON.stringify([
          { skill: 'React', confidence: 95, evidence: ['Project: Admin Dashboard', 'Project: Chat Web App', 'Meta Certification'], status: 'Verified' },
          { skill: 'JavaScript', confidence: 95, evidence: ['Project: Chat Web App'], status: 'Verified' },
          { skill: 'Git', confidence: 90, evidence: ['Project: Admin Dashboard'], status: 'Verified' },
          { skill: 'MongoDB', confidence: 25, evidence: ['Only listed in skills section'], status: 'Needs Validation' }
        ]),
        resume_suggestions: JSON.stringify({
          strengths: ['Great front-end project credentials', 'Meta certificate validation'],
          weaknesses: ['Entry-level professional experience', 'No SQL validation'],
          recommendations: ['Integrate a SQL database matching task into your chat app', 'Deploy the web app to a cloud host (AWS/GCP) and document load performance']
        }),
        quality_score: JSON.stringify({ grammar: 89, formatting: 93, projects: 83, skills: 88, overall: 88 }),
        resume_hash: 'hash_alice_williams'
      }
    ];

    for (const c of candidatesSeed) {
      await db.run(`
        INSERT INTO Candidates (
          candidate_id, user_id, full_name, email, phone, education, college, degree, cgpa, 
          experience_years, skills, certifications, projects, github, linkedin, 
          gender, age, religion, caste, marital_status, address, application_status,
          skill_validation, resume_suggestions, quality_score, resume_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        c.candidate_id, c.user_id, c.full_name, c.email, c.phone, c.education, c.college, c.degree, c.cgpa,
        c.experience_years, c.skills, c.certifications, c.projects, c.github, c.linkedin,
        c.gender, c.age, c.religion, c.caste, c.marital_status, c.address, c.application_status,
        c.skill_validation, c.resume_suggestions, c.quality_score, c.resume_hash
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

    // 4. Precalculate Scores & Seed Application Pipeline
    console.log('Precalculating candidate matching scores and seeding applications...');
    for (const c of candidatesSeed) {
      for (const j of jobsSeed) {
        const jobParsed = {
          required_skills: JSON.parse(j.required_skills),
          preferred_skills: JSON.parse(j.preferred_skills),
          experience_required: j.experience_required,
          min_cgpa: j.min_cgpa
        };
        const candidateParsed = {
          skills: JSON.parse(c.skills),
          experience_years: c.experience_years,
          cgpa: c.cgpa,
          projects: JSON.parse(c.projects),
          certifications: JSON.parse(c.certifications)
        };

        const scoreResult = calculateMatchScore(candidateParsed, jobParsed);

        // Determine if they applied for this job to set initial status
        let initialStatus: string | null = null;
        let isApplied = false;

        if (c.candidate_id === 1001 && j.job_id === 1) {
          initialStatus = 'Applied';
          isApplied = true;
        } else if (c.candidate_id === 1001 && j.job_id === 4) {
          initialStatus = 'Selected';
          isApplied = true;
        } else if (c.candidate_id === 1002 && j.job_id === 2) {
          initialStatus = 'Under Review';
          isApplied = true;
        } else if (c.candidate_id === 1003 && j.job_id === 1) {
          initialStatus = 'Shortlisted';
          isApplied = true;
        } else if (c.candidate_id === 1003 && j.job_id === 3) {
          initialStatus = 'Applied';
          isApplied = true;
        } else if (c.candidate_id === 1004 && j.job_id === 4) {
          initialStatus = 'Selected';
          isApplied = true;
        }

        await db.run(
          `INSERT INTO Scores (
            candidate_id, job_id, match_score, skill_score, experience_score, education_score, project_score, certification_score, final_weighted_score, status, applied_at, explainable_ai, fairness_report
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${isApplied ? 'CURRENT_TIMESTAMP' : 'NULL'}, ?, ?)`,
          [
            c.candidate_id, j.job_id, scoreResult.match_score, scoreResult.skill_score,
            scoreResult.experience_score, scoreResult.education_score, scoreResult.project_score, scoreResult.certification_score,
            scoreResult.final_weighted_score, initialStatus,
            JSON.stringify(scoreResult.explainable_ai), JSON.stringify(scoreResult.fairness_report)
          ]
        );
      }
    }

    // Reset database sequences in PostgreSQL to avoid primary key collisions on future inserts
    if (isPostgres) {
      console.log('Resetting PostgreSQL sequences...');
      await db.exec(`
        SELECT setval(pg_get_serial_sequence('"Users"', 'id'), COALESCE((SELECT MAX(id) FROM "Users"), 1));
        SELECT setval(pg_get_serial_sequence('"Candidates"', 'candidate_id'), COALESCE((SELECT MAX(candidate_id) FROM "Candidates"), 1000));
        SELECT setval(pg_get_serial_sequence('"Jobs"', 'job_id'), COALESCE((SELECT MAX(job_id) FROM "Jobs"), 1));
      `);
    }

    console.log('Database seeded successfully.');
  }
}
