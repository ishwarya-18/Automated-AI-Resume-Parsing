import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDb, initDb } from './db';
import { parseResumeText, extractTextFromFile } from './services/nlpParser';
import { calculateMatchScore } from './services/scoreEngine';

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_ai_resume_screener_token';

// Setup directories
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || ext === '.doc' || ext === '.docx') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed.'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Global System Configuration for Screening Mode
let anonymousScreeningMode = true;

// Authenticated request interface
interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: 'Admin' | 'Recruiter' | 'Candidate';
  };
}

// Auth Middleware
function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user as AuthRequest['user'];
    next();
  });
}

// Helper to check role permissions
function requireRole(roles: ('Admin' | 'Recruiter' | 'Candidate')[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permission denied for this role' });
    }
    next();
  };
}

// Helper to mask candidate details if anonymous mode is on
function maskCandidate(candidate: any) {
  if (!anonymousScreeningMode) {
    return candidate;
  }
  return {
    candidate_id: candidate.candidate_id,
    user_id: candidate.user_id,
    // Mask sensitive fields
    full_name: `Candidate #${candidate.candidate_id}`,
    email: 'masked@screening.platform',
    phone: '***-***-****',
    address: 'Masked Location',
    gender: 'Masked',
    age: 'Masked',
    religion: 'Masked',
    caste: 'Masked',
    marital_status: 'Masked',
    github: 'https://github.com/masked-candidate',
    linkedin: 'https://linkedin.com/in/masked-candidate',
    // Retain non-sensitive qualifications
    education: candidate.education,
    college: candidate.college,
    degree: candidate.degree,
    cgpa: candidate.cgpa,
    experience_years: candidate.experience_years,
    skills: candidate.skills,
    certifications: candidate.certifications,
    projects: candidate.projects,
    application_status: candidate.application_status
  };
}

// ==========================================
// AUTHENTICATION API ROUTES
// ==========================================

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required.' });
  }

  const db = await getDb();
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await db.run(
      'INSERT INTO Users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    );

    const userId = result.lastID;

    // If candidate, create a corresponding candidate record
    if (role === 'Candidate') {
      // Start candidate_id from a higher number (e.g. 1000 + lastID) to look like real candidates
      const customId = 1000 + (userId || 1);
      
      await db.run(
        `INSERT INTO Candidates (
          candidate_id, user_id, full_name, email, experience_years, cgpa, skills, certifications, projects, application_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customId,
          userId,
          name,
          email,
          0,
          0.0,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          'Applied'
        ]
      );
    }

    res.status(201).json({ message: 'User registered successfully!' });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Email already exists.' });
    }
    res.status(500).json({ error: 'Server registration error: ' + error.message });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const db = await getDb();
  try {
    const user = await db.get<any>('SELECT * FROM Users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    let candidateId = null;
    if (user.role === 'Candidate') {
      const cand = await db.get<any>('SELECT candidate_id FROM Candidates WHERE user_id = ?', [user.id]);
      if (cand) candidateId = cand.candidate_id;
    }

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        candidateId
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Server login error: ' + error.message });
  }
});

app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  // Mock forgot password sending trigger
  res.json({ message: `Password reset instructions sent to ${email} (mocked).` });
});

// ==========================================
// CANDIDATE PROFILE & RESUME API
// ==========================================

app.get('/api/candidate/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  try {
    let candidate;
    if (req.user?.role === 'Candidate') {
      candidate = await db.get('SELECT * FROM Candidates WHERE user_id = ?', [req.user.id]);
    } else {
      const { id } = req.query;
      candidate = await db.get('SELECT * FROM Candidates WHERE candidate_id = ?', [id]);
    }

    if (!candidate) {
      return res.status(404).json({ error: 'Candidate profile not found.' });
    }

    // Parse JSON strings
    const parsed = {
      ...candidate,
      skills: JSON.parse(candidate.skills || '[]'),
      certifications: JSON.parse(candidate.certifications || '[]'),
      projects: JSON.parse(candidate.projects || '[]')
    };

    // Apply masking if recruiter and anonymous mode is on
    if (req.user?.role === 'Recruiter') {
      return res.json(maskCandidate(parsed));
    }

    res.json(parsed);
  } catch (error: any) {
    res.status(500).json({ error: 'Error fetching candidate profile: ' + error.message });
  }
});

app.put('/api/candidate/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  const {
    full_name, phone, education, college, degree, cgpa,
    experience_years, skills, certifications, projects,
    github, linkedin, gender, age, religion, caste, marital_status, address
  } = req.body;

  try {
    let candidateId: number;

    if (req.user?.role === 'Candidate') {
      const cand = await db.get<any>('SELECT candidate_id FROM Candidates WHERE user_id = ?', [req.user.id]);
      if (!cand) return res.status(404).json({ error: 'Candidate profile not found.' });
      candidateId = cand.candidate_id;
    } else if (req.user?.role === 'Admin') {
      candidateId = parseInt(req.body.candidate_id);
    } else {
      return res.status(403).json({ error: 'Recruiters cannot edit profiles.' });
    }

    await db.run(
      `UPDATE Candidates SET
        full_name = ?, phone = ?, education = ?, college = ?, degree = ?, cgpa = ?,
        experience_years = ?, skills = ?, certifications = ?, projects = ?,
        github = ?, linkedin = ?, gender = ?, age = ?, religion = ?, caste = ?, marital_status = ?, address = ?
      WHERE candidate_id = ?`,
      [
        full_name, phone, education, college, degree, cgpa,
        experience_years,
        JSON.stringify(skills || []),
        JSON.stringify(certifications || []),
        JSON.stringify(projects || []),
        github, linkedin, gender, age, religion, caste, marital_status, address,
        candidateId
      ]
    );

    // Recalculate scores for this candidate against all existing jobs
    const jobs = await db.all('SELECT * FROM Jobs');
    for (const job of jobs) {
      const jobParsed = {
        required_skills: JSON.parse(job.required_skills),
        preferred_skills: JSON.parse(job.preferred_skills),
        experience_required: job.experience_required,
        min_cgpa: job.min_cgpa
      };
      const candidateParsed = {
        skills: skills || [],
        experience_years: experience_years || 0,
        cgpa: cgpa || 0.0,
        projects: projects || [],
        certifications: certifications || []
      };

      const result = calculateMatchScore(candidateParsed, jobParsed);

      await db.run(
        `INSERT INTO Scores (
          candidate_id, job_id, match_score, skill_score, experience_score, education_score, project_score, certification_score, final_weighted_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(candidate_id, job_id) DO UPDATE SET
          match_score = excluded.match_score,
          skill_score = excluded.skill_score,
          experience_score = excluded.experience_score,
          education_score = excluded.education_score,
          project_score = excluded.project_score,
          certification_score = excluded.certification_score,
          final_weighted_score = excluded.final_weighted_score`,
        [
          candidateId, job.job_id, result.match_score, result.skill_score,
          result.experience_score, result.education_score, result.project_score, result.certification_score,
          result.final_weighted_score
        ]
      );
    }

    res.json({ message: 'Profile updated and scores recalculated successfully!' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error updating candidate profile: ' + error.message });
  }
});

// Resume parser playground or direct candidate uploader
app.post('/api/candidate/upload-resume', authenticateToken, upload.single('resume'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a resume file.' });
  }

  const db = await getDb();
  try {
    let candidateId: number;

    if (req.user?.role === 'Candidate') {
      const cand = await db.get<any>('SELECT candidate_id FROM Candidates WHERE user_id = ?', [req.user.id]);
      if (!cand) return res.status(404).json({ error: 'Candidate profile not found.' });
      candidateId = cand.candidate_id;
    } else {
      // Recruiter or Admin uploading on behalf of candidate
      candidateId = parseInt(req.body.candidate_id);
      if (!candidateId) {
        return res.status(400).json({ error: 'Candidate ID is required for administrative resume upload.' });
      }
    }

    const fileExt = path.extname(req.file.originalname);
    
    // Parse text
    const text = await extractTextFromFile(req.file.path, fileExt);
    const parsed = parseResumeText(text);

    // Save Resume to Db
    await db.run(
      'INSERT INTO Resumes (candidate_id, file_name, file_path, parsed_data) VALUES (?, ?, ?, ?)',
      [candidateId, req.file.originalname, req.file.path, JSON.stringify(parsed)]
    );

    // Update Candidates Profile with Extracted Details
    await db.run(
      `UPDATE Candidates SET
        full_name = COALESCE(?, full_name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        education = ?,
        college = ?,
        degree = ?,
        cgpa = ?,
        experience_years = ?,
        skills = ?,
        certifications = ?,
        projects = ?,
        github = ?,
        linkedin = ?,
        gender = ?,
        age = ?,
        religion = ?,
        caste = ?,
        marital_status = ?,
        address = ?
      WHERE candidate_id = ?`,
      [
        parsed.fullName || null,
        parsed.email || null,
        parsed.phone || null,
        parsed.education[0]?.degree || 'Bachelor of Science',
        parsed.education[0]?.college || 'University',
        parsed.education[0]?.degree || 'B.Sc',
        parsed.education[0]?.cgpa || 7.5,
        parsed.experienceYears || 0,
        JSON.stringify(parsed.skills.technical || []),
        JSON.stringify(parsed.certifications || []),
        JSON.stringify(parsed.projects || []),
        parsed.github,
        parsed.linkedin,
        parsed.gender,
        parsed.age,
        parsed.religion,
        parsed.caste,
        parsed.maritalStatus,
        parsed.address,
        candidateId
      ]
    );

    // Recalculate scores for this candidate against all existing jobs
    const jobs = await db.all('SELECT * FROM Jobs');
    for (const job of jobs) {
      const jobParsed = {
        required_skills: JSON.parse(job.required_skills),
        preferred_skills: JSON.parse(job.preferred_skills),
        experience_required: job.experience_required,
        min_cgpa: job.min_cgpa
      };
      const candidateParsed = {
        skills: parsed.skills.technical || [],
        experience_years: parsed.experienceYears || 0.0,
        cgpa: parsed.education[0]?.cgpa || 7.5,
        projects: parsed.projects || [],
        certifications: parsed.certifications || []
      };

      const scoreResult = calculateMatchScore(candidateParsed, jobParsed);

      await db.run(
        `INSERT INTO Scores (
          candidate_id, job_id, match_score, skill_score, experience_score, education_score, project_score, certification_score, final_weighted_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(candidate_id, job_id) DO UPDATE SET
          match_score = excluded.match_score,
          skill_score = excluded.skill_score,
          experience_score = excluded.experience_score,
          education_score = excluded.education_score,
          project_score = excluded.project_score,
          certification_score = excluded.certification_score,
          final_weighted_score = excluded.final_weighted_score`,
        [
          candidateId, job.job_id, scoreResult.match_score, scoreResult.skill_score,
          scoreResult.experience_score, scoreResult.education_score, scoreResult.project_score, scoreResult.certification_score,
          scoreResult.final_weighted_score
        ]
      );
    }

    res.json({
      message: 'Resume parsed and candidate profile updated successfully!',
      parsedData: parsed
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Resume parsing error: ' + error.message });
  }
});

// A standalone route for Resume Parser Playground without affecting user profiles
app.post('/api/parser/test', upload.single('resume'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a resume file.' });
  }
  try {
    const fileExt = path.extname(req.file.originalname);
    const text = await extractTextFromFile(req.file.path, fileExt);
    const parsed = parseResumeText(text);

    // Clean up uploaded playground file asynchronously
    fs.unlink(req.file.path, () => {});

    res.json(parsed);
  } catch (error: any) {
    res.status(500).json({ error: 'Parser playground error: ' + error.message });
  }
});

// Standalone text-based parsing helper
app.post('/api/parser/text', (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Please provide resume text.' });
  }
  const parsed = parseResumeText(text);
  res.json(parsed);
});

// ==========================================
// RECRUITER & JOBS API
// ==========================================

app.post('/api/jobs', authenticateToken, requireRole(['Recruiter', 'Admin']), async (req: AuthRequest, res: Response) => {
  const { job_title, required_skills, preferred_skills, experience_required, min_cgpa, salary_range, location } = req.body;

  if (!job_title || !required_skills) {
    return res.status(400).json({ error: 'Job title and required skills are mandatory.' });
  }

  const db = await getDb();
  try {
    const result = await db.run(
      `INSERT INTO Jobs (
        recruiter_id, job_title, required_skills, preferred_skills, experience_required, min_cgpa, salary_range, location
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user?.id,
        job_title,
        JSON.stringify(required_skills || []),
        JSON.stringify(preferred_skills || []),
        experience_required || 0.0,
        min_cgpa || 0.0,
        salary_range,
        location
      ]
    );

    const jobId = result.lastID;

    // Recalculate scores for all candidates against this new job
    const candidates = await db.all('SELECT * FROM Candidates');
    for (const cand of candidates) {
      const jobParsed = {
        required_skills: required_skills || [],
        preferred_skills: preferred_skills || [],
        experience_required: experience_required || 0,
        min_cgpa: min_cgpa || 0
      };
      const candidateParsed = {
        skills: JSON.parse(cand.skills || '[]'),
        experience_years: cand.experience_years || 0,
        cgpa: cand.cgpa || 0,
        projects: JSON.parse(cand.projects || '[]'),
        certifications: JSON.parse(cand.certifications || '[]')
      };

      const scoreResult = calculateMatchScore(candidateParsed, jobParsed);

      await db.run(
        `INSERT INTO Scores (
          candidate_id, job_id, match_score, skill_score, experience_score, education_score, project_score, certification_score, final_weighted_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cand.candidate_id, jobId, scoreResult.match_score, scoreResult.skill_score,
          scoreResult.experience_score, scoreResult.education_score, scoreResult.project_score, scoreResult.certification_score,
          scoreResult.final_weighted_score
        ]
      );
    }

    res.status(201).json({ message: 'Job created successfully!', jobId });
  } catch (error: any) {
    res.status(500).json({ error: 'Error creating job: ' + error.message });
  }
});

app.get('/api/jobs', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  try {
    const jobs = await db.all('SELECT * FROM Jobs ORDER BY created_at DESC');
    const parsedJobs = jobs.map(j => ({
      ...j,
      required_skills: JSON.parse(j.required_skills || '[]'),
      preferred_skills: JSON.parse(j.preferred_skills || '[]')
    }));
    res.json(parsedJobs);
  } catch (error: any) {
    res.status(500).json({ error: 'Error listing jobs: ' + error.message });
  }
});

// Update application status
app.put('/api/candidate/status', authenticateToken, requireRole(['Recruiter', 'Admin']), async (req: AuthRequest, res: Response) => {
  const { candidate_id, status } = req.body;
  if (!candidate_id || !status) {
    return res.status(400).json({ error: 'Candidate ID and status are required.' });
  }

  const db = await getDb();
  try {
    await db.run(
      'UPDATE Candidates SET application_status = ? WHERE candidate_id = ?',
      [status, candidate_id]
    );
    res.json({ message: 'Application status updated successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error updating candidate status: ' + error.message });
  }
});

// ==========================================
// CANDIDATE SCREENING & LEADERBOARD RANKING
// ==========================================

// Get recruiter configuration for Anonymous screening
app.get('/api/recruiter/config', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ anonymousScreeningMode });
});

app.post('/api/recruiter/toggle-anonymous', authenticateToken, requireRole(['Recruiter', 'Admin']), (req: AuthRequest, res: Response) => {
  anonymousScreeningMode = !anonymousScreeningMode;
  res.json({ message: `Anonymous screening mode toggled ${anonymousScreeningMode ? 'ON' : 'OFF'}`, anonymousScreeningMode });
});

// Get all candidates (optionally filtered and masked)
app.get('/api/recruiter/candidates', authenticateToken, requireRole(['Recruiter', 'Admin']), async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  try {
    const candidates = await db.all('SELECT * FROM Candidates');
    const parsed = candidates.map(c => {
      const parsedCand = {
        ...c,
        skills: JSON.parse(c.skills || '[]'),
        certifications: JSON.parse(c.certifications || '[]'),
        projects: JSON.parse(c.projects || '[]')
      };
      return req.user?.role === 'Recruiter' ? maskCandidate(parsedCand) : parsedCand;
    });

    res.json(parsed);
  } catch (error: any) {
    res.status(500).json({ error: 'Error loading candidate listings: ' + error.message });
  }
});

// Rank candidates for a job (Leaderboard)
app.get('/api/jobs/:id/rankings', authenticateToken, async (req: AuthRequest, res: Response) => {
  const jobId = req.params.id;
  const db = await getDb();

  try {
    const job = await db.get('SELECT * FROM Jobs WHERE job_id = ?', [jobId]);
    if (!job) {
      return res.status(404).json({ error: 'Job description not found.' });
    }

    const query = `
      SELECT c.*, s.match_score, s.skill_score, s.experience_score, s.education_score, s.project_score, s.certification_score, s.final_weighted_score
      FROM Candidates c
      JOIN Scores s ON c.candidate_id = s.candidate_id
      WHERE s.job_id = ?
      ORDER BY s.final_weighted_score DESC
    `;
    const candidates = await db.all(query, [jobId]);

    const ranked = candidates.map((c, index) => {
      const details = {
        ...c,
        skills: JSON.parse(c.skills || '[]'),
        certifications: JSON.parse(c.certifications || '[]'),
        projects: JSON.parse(c.projects || '[]'),
        rank: index + 1
      };
      
      return req.user?.role === 'Recruiter' ? maskCandidate(details) : details;
    });

    res.json({
      job: {
        ...job,
        required_skills: JSON.parse(job.required_skills),
        preferred_skills: JSON.parse(job.preferred_skills)
      },
      rankings: ranked
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error generating rankings: ' + error.message });
  }
});

// Update score weights dynamically on demand (returns rankings with temporary client-specified weights)
app.post('/api/jobs/:id/simulate-rankings', authenticateToken, async (req: AuthRequest, res: Response) => {
  const jobId = req.params.id;
  const { skillWeight, experienceWeight, educationWeight, projectWeight, certificationWeight } = req.body;

  // Validate weights sum up to 1 (or 100)
  const totalWeight = skillWeight + experienceWeight + educationWeight + projectWeight + certificationWeight;
  if (Math.abs(totalWeight - 100) > 1 && Math.abs(totalWeight - 1.0) > 0.01) {
    return res.status(400).json({ error: 'Weights must sum to 100% or 1.0.' });
  }

  const db = await getDb();
  try {
    const job = await db.get('SELECT * FROM Jobs WHERE job_id = ?', [jobId]);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const query = `
      SELECT c.*, s.match_score, s.skill_score, s.experience_score, s.education_score, s.project_score, s.certification_score
      FROM Candidates c
      JOIN Scores s ON c.candidate_id = s.candidate_id
      WHERE s.job_id = ?
    `;
    const candidates = await db.all(query, [jobId]);

    // Recalculate based on weights
    const wSkill = skillWeight > 1 ? skillWeight / 100 : skillWeight;
    const wExp = experienceWeight > 1 ? experienceWeight / 100 : experienceWeight;
    const wEdu = educationWeight > 1 ? educationWeight / 100 : educationWeight;
    const wProj = projectWeight > 1 ? projectWeight / 100 : projectWeight;
    const wCert = certificationWeight > 1 ? certificationWeight / 100 : certificationWeight;

    const recalculated = candidates.map(c => {
      const final_weighted_score = Math.round(
        wSkill * (c.skill_score || 0) +
        wExp * (c.experience_score || 0) +
        wEdu * (c.education_score || 0) +
        wProj * (c.project_score || 0) +
        wCert * (c.certification_score || 0)
      );

      const details = {
        ...c,
        skills: JSON.parse(c.skills || '[]'),
        certifications: JSON.parse(c.certifications || '[]'),
        projects: JSON.parse(c.projects || '[]'),
        final_weighted_score
      };

      return req.user?.role === 'Recruiter' ? maskCandidate(details) : details;
    });

    // Sort descending
    recalculated.sort((a, b) => b.final_weighted_score - a.final_weighted_score);
    
    // Re-assign rank indices
    const ranked = recalculated.map((c, index) => ({
      ...c,
      rank: index + 1
    }));

    res.json({ rankings: ranked });
  } catch (error: any) {
    res.status(500).json({ error: 'Error calculating simulated rankings: ' + error.message });
  }
});

// ==========================================
// ANALYTICS & STATS API
// ==========================================

app.get('/api/analytics', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  try {
    // Totals
    const candidateCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM Candidates');
    const jobCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM Jobs');
    const shortlistedCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Candidates WHERE application_status = 'Shortlisted'");
    const selectedCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Candidates WHERE application_status = 'Selected'");

    // 1. Skill Distribution (Count of candidates possessing each tech skill)
    const candidates = await db.all('SELECT skills FROM Candidates');
    const skillCounts: Record<string, number> = {};
    candidates.forEach(c => {
      try {
        const skills: string[] = JSON.parse(c.skills || '[]');
        skills.forEach(s => {
          skillCounts[s] = (skillCounts[s] || 0) + 1;
        });
      } catch (e) {}
    });
    
    const skillDistribution = Object.keys(skillCounts).map(name => ({
      name,
      count: skillCounts[name]
    })).sort((a, b) => b.count - a.count).slice(0, 8); // Top 8 skills

    // 2. Candidate Score Histogram
    const scores = await db.all('SELECT final_weighted_score FROM Scores');
    const scoreBuckets = [
      { range: '0-20', count: 0 },
      { range: '21-40', count: 0 },
      { range: '41-60', count: 0 },
      { range: '61-80', count: 0 },
      { range: '81-100', count: 0 }
    ];

    scores.forEach(s => {
      const score = s.final_weighted_score;
      if (score <= 20) scoreBuckets[0].count++;
      else if (score <= 40) scoreBuckets[1].count++;
      else if (score <= 60) scoreBuckets[2].count++;
      else if (score <= 80) scoreBuckets[3].count++;
      else scoreBuckets[4].count++;
    });

    // 3. Top Skills Demand (Counts in Job Required Skills)
    const jobs = await db.all('SELECT required_skills FROM Jobs');
    const demandCounts: Record<string, number> = {};
    jobs.forEach(j => {
      try {
        const reqs: string[] = JSON.parse(j.required_skills || '[]');
        reqs.forEach(s => {
          demandCounts[s] = (demandCounts[s] || 0) + 1;
        });
      } catch (e) {}
    });

    const topSkillsDemand = Object.keys(demandCounts).map(name => ({
      name,
      count: demandCounts[name]
    })).sort((a, b) => b.count - a.count).slice(0, 8);

    // 4. Hiring Funnel Chart
    const applied = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Candidates WHERE application_status = 'Applied'");
    const underReview = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Candidates WHERE application_status = 'Under Review'");
    const shortlisted = shortlistedCount;
    const selected = selectedCount;
    const rejected = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Candidates WHERE application_status = 'Rejected'");

    const hiringFunnel = [
      { stage: 'Applied', count: (applied?.count || 0) + (underReview?.count || 0) + (shortlisted?.count || 0) + (selected?.count || 0) },
      { stage: 'Under Review', count: (underReview?.count || 0) + (shortlisted?.count || 0) + (selected?.count || 0) },
      { stage: 'Shortlisted', count: shortlisted?.count || 0 },
      { stage: 'Selected', count: selected?.count || 0 },
      { stage: 'Rejected', count: rejected?.count || 0 }
    ];

    res.json({
      cards: {
        totalCandidates: candidateCount?.count || 0,
        totalJobs: jobCount?.count || 0,
        shortlisted: shortlistedCount?.count || 0,
        selected: selectedCount?.count || 0
      },
      charts: {
        skillDistribution,
        scoreHistogram: scoreBuckets,
        topSkillsDemand,
        hiringFunnel
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error generating analytics: ' + error.message });
  }
});

// ==========================================
// REPORT GENERATION & DATA EXPORTS
// ==========================================

// Export CSV Candidate Evaluation Report
app.get('/api/reports/export/csv/:candidateId/:jobId', authenticateToken, requireRole(['Recruiter', 'Admin']), async (req: AuthRequest, res: Response) => {
  const { candidateId, jobId } = req.params;
  const db = await getDb();

  try {
    const candidate = await db.get('SELECT * FROM Candidates WHERE candidate_id = ?', [candidateId]);
    const job = await db.get('SELECT * FROM Jobs WHERE job_id = ?', [jobId]);
    const score = await db.get('SELECT * FROM Scores WHERE candidate_id = ? AND job_id = ?', [candidateId, jobId]);

    if (!candidate || !job || !score) {
      return res.status(404).json({ error: 'Information insufficient to export report.' });
    }

    const jobParsed = {
      required_skills: JSON.parse(job.required_skills || '[]'),
      preferred_skills: JSON.parse(job.preferred_skills || '[]')
    };

    const candParsed = {
      skills: JSON.parse(candidate.skills || '[]')
    };

    // Skills logic
    const matched = jobParsed.required_skills.filter((s: string) => candParsed.skills.includes(s));
    const missing = jobParsed.required_skills.filter((s: string) => !candParsed.skills.includes(s));

    const finalCand = req.user?.role === 'Recruiter' ? maskCandidate(candidate) : candidate;

    let csvContent = `AI CANDIDATE EVALUATION REPORT\n`;
    csvContent += `Job Title,${job.job_title}\n`;
    csvContent += `Candidate ID,${finalCand.candidate_id}\n`;
    csvContent += `Candidate Name,${finalCand.full_name}\n`;
    csvContent += `Email,${finalCand.email}\n`;
    csvContent += `Experience Years,${finalCand.experience_years}\n`;
    csvContent += `CGPA,${finalCand.cgpa}\n`;
    csvContent += `Skill Score,${score.skill_score}%\n`;
    csvContent += `Experience Score,${score.experience_score}%\n`;
    csvContent += `Education Score,${score.education_score}%\n`;
    csvContent += `Projects Score,${score.project_score}%\n`;
    csvContent += `Certifications Score,${score.certification_score}%\n`;
    csvContent += `Final Weighted Score,${score.final_weighted_score}%\n`;
    csvContent += `Matched Required Skills,"${matched.join(', ')}"\n`;
    csvContent += `Missing Required Skills,"${missing.join(', ')}"\n`;
    csvContent += `Application Status,${finalCand.application_status}\n`;
    csvContent += `Comments,"${score.comments || 'No recruiter comments.'}"\n`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Candidate_${candidateId}_Report.csv`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ error: 'CSV Export error: ' + error.message });
  }
});

// Update candidate comments
app.post('/api/scores/comment', authenticateToken, requireRole(['Recruiter', 'Admin']), async (req: AuthRequest, res: Response) => {
  const { candidate_id, job_id, comments } = req.body;
  if (!candidate_id || !job_id) {
    return res.status(400).json({ error: 'Candidate ID and Job ID are required.' });
  }

  const db = await getDb();
  try {
    await db.run(
      'UPDATE Scores SET comments = ? WHERE candidate_id = ? AND job_id = ?',
      [comments, candidate_id, job_id]
    );
    res.json({ message: 'Comments updated successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error saving comments: ' + error.message });
  }
});

// ==========================================
// APP INITIALIZATION & START
// ==========================================

async function startServer() {
  try {
    console.log('Initializing SQLite Database...');
    await initDb();
    
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`Server is running at: http://localhost:${PORT}`);
      console.log(`==================================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
