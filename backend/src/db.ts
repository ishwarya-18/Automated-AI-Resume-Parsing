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
      const lower = translated.toLowerCase();
      if (lower.includes('candidates')) {
        translated += ' RETURNING candidate_id';
      } else if (lower.includes('users')) {
        translated += ' RETURNING id';
      } else if (lower.includes('jobs')) {
        translated += ' RETURNING job_id';
      } else if (lower.includes('resumes')) {
        translated += ' RETURNING resume_id';
      } else if (lower.includes('scores')) {
        translated += ' RETURNING score_id';
      } else if (lower.includes('reports')) {
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
      languages TEXT,
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
      [3, 'Candidate Alpha', 'candidate1@example.com', candidatePassword, 'Candidate']
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [4, 'Candidate Beta', 'candidate2@example.com', candidatePassword, 'Candidate']
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [5, 'Candidate Gamma', 'candidate3@example.com', candidatePassword, 'Candidate']
    );
    await db.run('INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [6, 'Candidate Delta', 'candidate4@example.com', candidatePassword, 'Candidate']
    );

    // 2. Insert Candidates
    const candidatesSeed = [
      {
        candidate_id: 1001,
        user_id: 3,
        full_name: 'Candidate Alpha',
        email: 'candidate1@example.com',
        phone: '+1 (555) 019-2834',
        education: 'B.Tech in Engineering Science',
        college: 'State Technical University',
        degree: 'Bachelor of Technology',
        cgpa: 7.9,
        experience_years: 1.5,
        skills: JSON.stringify(['Go', 'TypeScript', 'Node.js', 'Git', 'REST API', 'JavaScript', 'HTML', 'CSS']),
        certifications: JSON.stringify(['Cloud Specialist Accreditation', 'Professional Developer Associate']),
        projects: JSON.stringify([
          { name: 'Microservices Gateway', desc: 'Go-based load balancer and gateway proxy API' },
          { name: 'Portfolio Website', desc: 'Static HTML/CSS website with responsive design' }
        ]),
        github: 'https://github.com/candidatealpha',
        linkedin: 'https://linkedin.com/in/candidatealpha',
        gender: 'Male',
        age: 24,
        religion: 'None',
        caste: 'General',
        marital_status: 'Single',
        address: '456 Main St, Boston, MA',
        application_status: 'Applied',
        skill_validation: JSON.stringify([
          { skill: 'Go', confidence: 92, evidence: ['Project: Microservices Gateway'], status: 'Verified' },
          { skill: 'TypeScript', confidence: 85, evidence: ['Project: Microservices Gateway'], status: 'Verified' }
        ]),
        resume_suggestions: JSON.stringify({
          strengths: ['Strong Go project evidence'],
          weaknesses: ['Entry-level professional experience'],
          recommendations: ['Consider acquiring specialized database certifications.']
        }),
        quality_score: JSON.stringify({ 
          grammar: 88, formatting: 82, projects: 78, skills: 75, overall: 81,
          ats_compatibility: 80, resume_completeness: 85, skill_validation_score: 75,
          project_strength: 72, experience_score: 68, certification_score: 70,
          resume_quality_score: 80, grammar_score: 88, keyword_match: 75, overall_score: 81
        }),
        resume_hash: 'hash_candidate_alpha'
      },
      {
        candidate_id: 1002,
        user_id: 4,
        full_name: 'Candidate Beta',
        email: 'candidate2@example.com',
        phone: '+1 (555) 014-9821',
        education: 'M.Tech in Data Intelligence',
        college: 'Science Institute of Tech',
        degree: 'Master of Technology',
        cgpa: 9.1,
        experience_years: 4.0,
        skills: JSON.stringify(['Python', 'Rust', 'Docker', 'Git', 'REST API']),
        certifications: JSON.stringify(['Specialized Data Systems Associate', 'Container Technologies Professional']),
        projects: JSON.stringify([
          { name: 'Data Pipeline Parser', desc: 'Predictive analytics ETL parser written in Python and Rust' }
        ]),
        github: 'https://github.com/candidatebeta',
        linkedin: 'https://linkedin.com/in/candidatebeta',
        gender: 'Female',
        age: 27,
        religion: 'None',
        caste: 'General',
        marital_status: 'Single',
        address: '789 Science Blvd, San Jose, CA',
        application_status: 'Under Review',
        skill_validation: JSON.stringify([
          { skill: 'Python', confidence: 96, evidence: ['Project: Data Pipeline Parser'], status: 'Verified' },
          { skill: 'Rust', confidence: 90, evidence: ['Project: Data Pipeline Parser'], status: 'Verified' }
        ]),
        resume_suggestions: JSON.stringify({
          strengths: ['Advanced academic credentials', 'Specialized container expertise'],
          weaknesses: ['Minimal front-end project context'],
          recommendations: ['Build a secondary web interface showcasing data metrics.']
        }),
        quality_score: JSON.stringify({ 
          grammar: 92, formatting: 90, projects: 85, skills: 88, overall: 89,
          ats_compatibility: 90, resume_completeness: 92, skill_validation_score: 88,
          project_strength: 84, experience_score: 85, certification_score: 80,
          resume_quality_score: 88, grammar_score: 92, keyword_match: 86, overall_score: 89
        }),
        resume_hash: 'hash_candidate_beta'
      },
      {
        candidate_id: 1003,
        user_id: 5,
        full_name: 'Candidate Gamma',
        email: 'candidate3@example.com',
        phone: '+1 (555) 018-3729',
        education: 'Bachelor of Science',
        college: 'State University of Tech',
        degree: 'Bachelor of Science',
        cgpa: 7.2,
        experience_years: 5.5,
        skills: JSON.stringify(['C++', 'C#', 'SQL', 'Git']),
        certifications: JSON.stringify(['Professional Systems Architect']),
        projects: JSON.stringify([
          { name: 'Systems Registry Automator', desc: 'High-throughput registry backend using C++ and C#' }
        ]),
        github: 'https://github.com/candidategamma',
        linkedin: 'https://linkedin.com/in/candidategamma',
        gender: 'Male',
        age: 29,
        religion: 'None',
        caste: 'General',
        marital_status: 'Married',
        address: '101 Tech Ave, Denver, CO',
        application_status: 'Shortlisted',
        skill_validation: JSON.stringify([
          { skill: 'C++', confidence: 94, evidence: ['Project: Systems Registry Automator'], status: 'Verified' },
          { skill: 'C#', confidence: 90, evidence: ['Project: Systems Registry Automator'], status: 'Verified' }
        ]),
        resume_suggestions: JSON.stringify({
          strengths: ['Extensive systems software experience'],
          weaknesses: ['Lower CGPA compared to averages'],
          recommendations: ['Offset academic marks by listing cloud-based certifications.']
        }),
        quality_score: JSON.stringify({ 
          grammar: 78, formatting: 75, projects: 70, skills: 72, overall: 74,
          ats_compatibility: 70, resume_completeness: 75, skill_validation_score: 72,
          project_strength: 68, experience_score: 80, certification_score: 65,
          resume_quality_score: 74, grammar_score: 78, keyword_match: 71, overall_score: 74
        }),
        resume_hash: 'hash_candidate_gamma'
      },
      {
        candidate_id: 1004,
        user_id: 6,
        full_name: 'Candidate Delta',
        email: 'candidate4@example.com',
        phone: '+1 (555) 012-7491',
        education: 'Bachelor of Engineering',
        college: 'Polytechnic College of Science',
        degree: 'Bachelor of Engineering',
        cgpa: 8.2,
        experience_years: 1.0,
        skills: JSON.stringify(['HTML', 'CSS', 'JavaScript', 'Git']),
        certifications: JSON.stringify(['Front-End Fundamentals Certification']),
        projects: JSON.stringify([
          { name: 'Admin Dashboard Panel', desc: 'Responsive site dashboard featuring interactive tables' }
        ]),
        github: 'https://github.com/candidatedelta',
        linkedin: 'https://linkedin.com/in/candidatedelta',
        gender: 'Female',
        age: 22,
        religion: 'None',
        caste: 'General',
        marital_status: 'Single',
        address: '202 Sector 8, Austin, TX',
        application_status: 'Selected',
        skill_validation: JSON.stringify([
          { skill: 'HTML', confidence: 95, evidence: ['Project: Admin Dashboard Panel'], status: 'Verified' },
          { skill: 'CSS', confidence: 95, evidence: ['Project: Admin Dashboard Panel'], status: 'Verified' }
        ]),
        resume_suggestions: JSON.stringify({
          strengths: ['Responsive web layout designs'],
          weaknesses: ['Entry-level systems context'],
          recommendations: ['Document backend server configuration skills.']
        }),
        quality_score: JSON.stringify({ 
          grammar: 84, formatting: 86, projects: 72, skills: 70, overall: 78,
          ats_compatibility: 75, resume_completeness: 78, skill_validation_score: 70,
          project_strength: 68, experience_score: 60, certification_score: 65,
          resume_quality_score: 80, grammar_score: 84, keyword_match: 70, overall_score: 78
        }),
        resume_hash: 'hash_candidate_delta'
      }
    ];

    for (const c of candidatesSeed) {
      await db.run(`
        INSERT INTO Candidates (
          candidate_id, user_id, full_name, email, phone, education, college, degree, cgpa, 
          experience_years, skills, certifications, projects, github, linkedin, 
          gender, age, religion, caste, marital_status, address, languages, application_status,
          skill_validation, resume_suggestions, quality_score, resume_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        c.candidate_id, c.user_id, c.full_name, c.email, c.phone, c.education, c.college, c.degree, c.cgpa,
        c.experience_years, c.skills, c.certifications, c.projects, c.github, c.linkedin,
        c.gender, c.age, c.religion, c.caste, c.marital_status, c.address, JSON.stringify(['English']), c.application_status,
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

        const scoreResult = await calculateMatchScore(candidateParsed, jobParsed);

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
