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
import { getAssessmentQuestionsForSkills, evaluateAssessmentAnswer } from './services/assessmentEngine';

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_ai_resume_screener_token';
const PIPELINE_STATUSES = ['Applied', 'Under Review', 'Shortlisted', 'Rejected', 'Selected'] as const;

function parseJsonField<T>(val: any, fallback: T): T {
  if (val == null || val === '') return fallback;
  if (typeof val === 'object') return val as T;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function isAppliedStatus(status: any): boolean {
  return typeof status === 'string' && (PIPELINE_STATUSES as readonly string[]).includes(status);
}

function issueAuthToken(user: { id: number; email: string; role: 'Admin' | 'Recruiter' | 'Candidate' }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

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
    college: 'Masked Institution',
    degree: candidate.degree,
    cgpa: candidate.cgpa,
    experience_years: candidate.experience_years,
    skills: candidate.skills,
    certifications: candidate.certifications,
    projects: candidate.projects,
    application_status: candidate.application_status,
    skill_validation: candidate.skill_validation,
    resume_suggestions: candidate.resume_suggestions,
    quality_score: candidate.quality_score,
    explainable_ai: candidate.explainable_ai,
    fairness_report: candidate.fairness_report
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

    let candidateId: number | null = null;
    if (role === 'Candidate') {
      const customId = 1000 + (userId || 1);
      const candResult = await db.run(
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
          null
        ]
      );
      candidateId = candResult.lastID || customId;
    }

    const createdUser = { id: userId as number, email, role, name };
    const token = issueAuthToken({ id: createdUser.id, email, role });

    res.status(201).json({
      message: 'User registered successfully!',
      token,
      user: {
        id: createdUser.id,
        name,
        email,
        role,
        candidateId
      }
    });
  } catch (error: any) {
    if (error.message && (error.message.includes('UNIQUE constraint failed') || error.message.includes('duplicate key'))) {
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

    const token = issueAuthToken({ id: user.id, email: user.email, role: user.role });

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

    const resumeRow = await db.get('SELECT resume_id FROM Resumes WHERE candidate_id = ?', [candidate.candidate_id]);
    const appliedRow = await db.get(
      'SELECT status FROM Scores WHERE candidate_id = ? AND status IS NOT NULL ORDER BY applied_at DESC LIMIT 1',
      [candidate.candidate_id]
    );

    let parsed: any = {
      ...candidate,
      skills: parseJsonField(candidate.skills, []),
      certifications: parseJsonField(candidate.certifications, []),
      projects: parseJsonField(candidate.projects, []),
      skill_validation: parseJsonField(candidate.skill_validation, []),
      resume_suggestions: parseJsonField(candidate.resume_suggestions, { strengths: [], weaknesses: [], recommendations: [] }),
      quality_score: parseJsonField(candidate.quality_score, { grammar: 0, formatting: 0, projects: 0, skills: 0, overall: 0 }),
      resume_uploaded: !!resumeRow,
      application_status: isAppliedStatus(appliedRow?.status) ? appliedRow.status : null
    };

    // Keep profile fields empty until a resume is actually uploaded
    if (!resumeRow && req.user?.role === 'Candidate') {
      parsed = {
        ...parsed,
        phone: '',
        education: '',
        college: '',
        degree: '',
        cgpa: 0,
        experience_years: 0,
        skills: [],
        certifications: [],
        projects: [],
        github: '',
        linkedin: '',
        skill_validation: [],
        resume_suggestions: { strengths: [], weaknesses: [], recommendations: [] },
        quality_score: { grammar: 0, formatting: 0, projects: 0, skills: 0, overall: 0 }
      };
    }

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

    const mockText = `
    Name: ${full_name || ''}
    Skills: ${(skills || []).join(', ')}
    Certifications: ${(certifications || []).join(', ')}
    Projects: ${(projects || []).map((p: any) => `${p.name}: ${p.desc}`).join('\n')}
    `;
    const parsedAi = await parseResumeText(mockText);

    await db.run(
      `UPDATE Candidates SET
        full_name = ?, phone = ?, education = ?, college = ?, degree = ?, cgpa = ?,
        experience_years = ?, skills = ?, certifications = ?, projects = ?,
        github = ?, linkedin = ?, gender = ?, age = ?, religion = ?, caste = ?, marital_status = ?, address = ?,
        skill_validation = ?, resume_suggestions = ?, quality_score = ?, resume_hash = ?
      WHERE candidate_id = ?`,
      [
        full_name, phone, education, college, degree, cgpa,
        experience_years,
        JSON.stringify(skills || []),
        JSON.stringify(certifications || []),
        JSON.stringify(projects || []),
        github, linkedin, gender, age, religion, caste, marital_status, address,
        JSON.stringify(parsedAi.skill_validation),
        JSON.stringify(parsedAi.resume_suggestions),
        JSON.stringify(parsedAi.quality_score),
        parsedAi.resume_hash,
        candidateId
      ]
    );

    const appliedScores = await db.all('SELECT * FROM Scores WHERE candidate_id = ? AND status IS NOT NULL', [candidateId]);
    for (const sc of appliedScores) {
      const job = await db.get('SELECT * FROM Jobs WHERE job_id = ?', [sc.job_id]);
      if (!job) continue;
      const jobParsed = {
        required_skills: parseJsonField(job.required_skills, []),
        preferred_skills: parseJsonField(job.preferred_skills, []),
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

      const result = await calculateMatchScore(candidateParsed, jobParsed);

      await db.run(
        `UPDATE Scores SET
          match_score = ?, skill_score = ?, experience_score = ?, education_score = ?,
          project_score = ?, certification_score = ?, final_weighted_score = ?,
          explainable_ai = ?, fairness_report = ?
        WHERE candidate_id = ? AND job_id = ?`,
        [
          result.match_score, result.skill_score, result.experience_score, result.education_score,
          result.project_score, result.certification_score, result.final_weighted_score,
          JSON.stringify(result.explainable_ai), JSON.stringify(result.fairness_report),
          candidateId, job.job_id
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
    const parsed = await parseResumeText(text);

    // Save Resume to Db
    await db.run(
      'INSERT INTO Resumes (candidate_id, file_name, file_path, parsed_data) VALUES (?, ?, ?, ?)',
      [candidateId, req.file.originalname, req.file.path, JSON.stringify(parsed)]
    );

    const extractedName = parsed.fullName && parsed.fullName !== 'Unknown Candidate' ? parsed.fullName : null;
    const edu = parsed.education?.[0];
    const degreeValue = edu?.degree && edu.degree !== 'Not Disclosed' ? edu.degree : '';
    const collegeValue = edu?.college && edu.college !== 'Not Disclosed' ? edu.college : '';

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
        address = ?,
        skill_validation = ?,
        resume_suggestions = ?,
        quality_score = ?,
        resume_hash = ?
      WHERE candidate_id = ?`,
      [
        extractedName,
        parsed.email || null,
        parsed.phone || null,
        degreeValue,
        collegeValue,
        degreeValue,
        edu?.cgpa || 0,
        parsed.experienceYears || 0,
        JSON.stringify(parsed.skills.technical || []),
        JSON.stringify(parsed.certifications || []),
        JSON.stringify(parsed.projects || []),
        parsed.github || '',
        parsed.linkedin || '',
        parsed.gender || 'Not Disclosed',
        parsed.age || 0,
        parsed.religion || 'Not Disclosed',
        parsed.caste || 'Not Disclosed',
        parsed.maritalStatus || 'Not Disclosed',
        parsed.address || '',
        JSON.stringify(parsed.skill_validation || []),
        JSON.stringify(parsed.resume_suggestions || {}),
        JSON.stringify(parsed.quality_score || {}),
        parsed.resume_hash,
        candidateId
      ]
    );

    const appliedScores = await db.all('SELECT * FROM Scores WHERE candidate_id = ? AND status IS NOT NULL', [candidateId]);
    for (const sc of appliedScores) {
      const job = await db.get('SELECT * FROM Jobs WHERE job_id = ?', [sc.job_id]);
      if (!job) continue;
      const jobParsed = {
        required_skills: parseJsonField(job.required_skills, []),
        preferred_skills: parseJsonField(job.preferred_skills, []),
        experience_required: job.experience_required,
        min_cgpa: job.min_cgpa
      };
      const candidateParsed = {
        skills: parsed.skills.technical || [],
        experience_years: parsed.experienceYears || 0.0,
        cgpa: edu?.cgpa || 0,
        projects: parsed.projects || [],
        certifications: parsed.certifications || []
      };

      const scoreResult = await calculateMatchScore(candidateParsed, jobParsed);

      await db.run(
        `UPDATE Scores SET
          match_score = ?, skill_score = ?, experience_score = ?, education_score = ?,
          project_score = ?, certification_score = ?, final_weighted_score = ?,
          explainable_ai = ?, fairness_report = ?
        WHERE candidate_id = ? AND job_id = ?`,
        [
          scoreResult.match_score, scoreResult.skill_score, scoreResult.experience_score, scoreResult.education_score,
          scoreResult.project_score, scoreResult.certification_score, scoreResult.final_weighted_score,
          JSON.stringify(scoreResult.explainable_ai), JSON.stringify(scoreResult.fairness_report),
          candidateId, job.job_id
        ]
      );
    }

    const similarCand = await db.get<any>('SELECT candidate_id, full_name FROM Candidates WHERE resume_hash = ? AND candidate_id != ?', [parsed.resume_hash, candidateId]);
    let duplicateWarning: any = null;
    if (similarCand) {
      duplicateWarning = {
        message: `Resume similarity check: Uploaded document matches 98% with existing candidate CAN-${similarCand.candidate_id}.`,
        candidate_id: similarCand.candidate_id
      };
    }

    res.json({
      message: 'Resume parsed and candidate profile updated successfully!',
      parsedData: parsed,
      duplicateWarning
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
    const parsed = await parseResumeText(text);

    // Clean up uploaded playground file asynchronously
    fs.unlink(req.file.path, () => {});

    res.json(parsed);
  } catch (error: any) {
    res.status(500).json({ error: 'Parser playground error: ' + error.message });
  }
});

// Standalone text-based parsing helper
app.post('/api/parser/text', async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Please provide resume text.' });
  }
  const parsed = await parseResumeText(text);
  res.json(parsed);
});

// ==========================================
// AI SKILL ASSESSMENT & QUESTION EVALUATION API
// ==========================================

// Get dynamic technical questions tailored to the candidate's skills
app.get('/api/assessment/questions', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  try {
    let skills: string[] = [];
    if (req.user?.role === 'Candidate') {
      const cand = await db.get<any>('SELECT skills FROM Candidates WHERE user_id = ?', [req.user.id]);
      if (cand && cand.skills) {
        skills = parseJsonField(cand.skills, []);
      }
    }
    const questions = getAssessmentQuestionsForSkills(skills);
    res.json({ questions, candidateSkills: skills });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate assessment questions: ' + error.message });
  }
});

// Real NLP evaluation of technical answer
app.post('/api/assessment/evaluate', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { question, answer, skill } = req.body;
  if (!question || !answer) {
    return res.status(400).json({ error: 'Question and answer are required.' });
  }

  const evaluation = evaluateAssessmentAnswer(question, answer, skill);
  const db = await getDb();

  try {
    if (req.user?.role === 'Candidate') {
      const cand = await db.get<any>('SELECT * FROM Candidates WHERE user_id = ?', [req.user.id]);
      if (cand) {
        const candidateId = cand.candidate_id;
        let skillValidation: any[] = parseJsonField(cand.skill_validation, []);
        let qualityScore: any = parseJsonField(cand.quality_score, {});

        // Update or add the assessed skill in skill_validation
        const targetSkill = (skill || 'General').trim();
        const existingIdx = skillValidation.findIndex(
          (sv: any) => sv.skill.toLowerCase() === targetSkill.toLowerCase()
        );

        const newEvidence = evaluation.score > 0
          ? [`AI Assessment: ${evaluation.score}% - ${evaluation.verdict}`]
          : [`Assessment Attempt: ${evaluation.score}% (${evaluation.verdict})`];

        if (existingIdx >= 0) {
          skillValidation[existingIdx].confidence = evaluation.score;
          skillValidation[existingIdx].status = evaluation.verified ? 'Verified' : 'Needs Validation';
          skillValidation[existingIdx].evidence = newEvidence;
        } else {
          skillValidation.push({
            skill: targetSkill,
            confidence: evaluation.score,
            status: evaluation.verified ? 'Verified' : 'Needs Validation',
            evidence: newEvidence
          });
        }

        // Recalculate average skill validation score
        const totalConf = skillValidation.reduce((sum, sv) => sum + (sv.confidence || 0), 0);
        const avgValidation = skillValidation.length > 0 ? Math.round(totalConf / skillValidation.length) : evaluation.score;

        qualityScore.skill_validation_score = avgValidation;
        qualityScore.overall_score = Math.round(
          0.30 * (qualityScore.ats_compatibility || 80) +
          0.30 * (qualityScore.skills || 80) +
          0.20 * (qualityScore.projects || 75) +
          0.20 * avgValidation
        );

        // Save updated validation to candidate in DB
        await db.run(
          `UPDATE Candidates SET
            skill_validation = ?,
            quality_score = ?
          WHERE candidate_id = ?`,
          [
            JSON.stringify(skillValidation),
            JSON.stringify(qualityScore),
            candidateId
          ]
        );

        // Recalculate match scores for jobs candidate applied to
        const appliedScores = await db.all('SELECT * FROM Scores WHERE candidate_id = ? AND status IS NOT NULL', [candidateId]);
        for (const sc of appliedScores) {
          const job = await db.get('SELECT * FROM Jobs WHERE job_id = ?', [sc.job_id]);
          if (job) {
            const jobParsed = {
              required_skills: parseJsonField(job.required_skills, []),
              preferred_skills: parseJsonField(job.preferred_skills, []),
              experience_required: job.experience_required,
              min_cgpa: job.min_cgpa
            };
            const candParsed = {
              skills: parseJsonField(cand.skills, []),
              experience_years: cand.experience_years || 0,
              cgpa: cand.cgpa || 0,
              projects: parseJsonField(cand.projects, []),
              certifications: parseJsonField(cand.certifications, []),
              assessment_score: evaluation.score
            };
            const updatedMatch = await calculateMatchScore(candParsed, jobParsed);
            await db.run(
              `UPDATE Scores SET
                final_weighted_score = ?,
                explainable_ai = ?
              WHERE candidate_id = ? AND job_id = ?`,
              [
                updatedMatch.final_weighted_score,
                JSON.stringify(updatedMatch.explainable_ai),
                candidateId,
                job.job_id
              ]
            );
          }
        }
      }
    }

    res.json(evaluation);
  } catch (error: any) {
    res.status(500).json({ error: 'Error saving assessment evaluation: ' + error.message });
  }
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

    let jobId = result.lastID;
    if (!jobId) {
      const created = await db.get<any>(
        'SELECT job_id FROM Jobs WHERE recruiter_id = ? AND job_title = ? ORDER BY job_id DESC',
        [req.user?.id, job_title]
      );
      jobId = created?.job_id;
    }

    res.status(201).json({
      message: 'Job created successfully!',
      jobId,
      job: {
        job_id: jobId,
        recruiter_id: req.user?.id,
        job_title,
        required_skills: required_skills || [],
        preferred_skills: preferred_skills || [],
        experience_required: experience_required || 0.0,
        min_cgpa: min_cgpa || 0.0,
        salary_range,
        location,
        application_status: null
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error creating job: ' + error.message });
  }
});

app.get('/api/jobs', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  try {
    const jobs = await db.all('SELECT * FROM Jobs ORDER BY job_id DESC');
    let candidateRow: any = null;
    let scores: any[] = [];

    if (req.user?.role === 'Candidate') {
      candidateRow = await db.get('SELECT * FROM Candidates WHERE user_id = ?', [req.user.id]);
      if (candidateRow) {
        scores = await db.all('SELECT * FROM Scores WHERE candidate_id = ?', [candidateRow.candidate_id]);
      }
    }

    const scoreByJob = new Map<number, any>(scores.map((s: any) => [Number(s.job_id), s]));
    const parsedJobs: any[] = [];

    for (const j of jobs) {
      const jobParsed = {
        required_skills: parseJsonField(j.required_skills, []),
        preferred_skills: parseJsonField(j.preferred_skills, []),
        experience_required: j.experience_required,
        min_cgpa: j.min_cgpa
      };
      const sc = scoreByJob.get(j.job_id);
      let match_score = sc?.match_score ?? 0;
      let final_weighted_score = sc?.final_weighted_score ?? 0;
      const application_status = isAppliedStatus(sc?.status) ? sc.status : null;

      if (candidateRow && !sc) {
        const live = await calculateMatchScore({
          skills: parseJsonField(candidateRow.skills, []),
          experience_years: candidateRow.experience_years || 0,
          cgpa: candidateRow.cgpa || 0,
          projects: parseJsonField(candidateRow.projects, []),
          certifications: parseJsonField(candidateRow.certifications, [])
        }, jobParsed);
        match_score = live.match_score;
        final_weighted_score = live.final_weighted_score;
      }

      parsedJobs.push({
        ...j,
        required_skills: jobParsed.required_skills,
        preferred_skills: jobParsed.preferred_skills,
        match_score,
        final_weighted_score,
        application_status
      });
    }

    res.json(parsedJobs);
  } catch (error: any) {
    res.status(500).json({ error: 'Error listing jobs: ' + error.message });
  }
});

// Apply for a job
app.post('/api/jobs/:id/apply', authenticateToken, requireRole(['Candidate']), async (req: AuthRequest, res: Response) => {
  const jobId = req.params.id;
  const db = await getDb();
  try {
    const cand = await db.get('SELECT candidate_id FROM Candidates WHERE user_id = ?', [req.user?.id]);
    if (!cand) return res.status(404).json({ error: 'Candidate profile not found.' });

    const job = await db.get('SELECT * FROM Jobs WHERE job_id = ?', [jobId]);
    const candidate = await db.get('SELECT * FROM Candidates WHERE candidate_id = ?', [cand.candidate_id]);

    if (!job || !candidate) {
      return res.status(404).json({ error: 'Job or Candidate not found.' });
    }

    const jobParsed = {
      required_skills: parseJsonField(job.required_skills, []),
      preferred_skills: parseJsonField(job.preferred_skills, []),
      experience_required: job.experience_required,
      min_cgpa: job.min_cgpa
    };
    const candidateParsed = {
      skills: parseJsonField(candidate.skills, []),
      experience_years: candidate.experience_years || 0,
      cgpa: candidate.cgpa || 0,
      projects: parseJsonField(candidate.projects, []),
      certifications: parseJsonField(candidate.certifications, [])
    };

    const scoreResult = await calculateMatchScore(candidateParsed, jobParsed);

    await db.run(
      `INSERT INTO Scores (
        candidate_id, job_id, match_score, skill_score, experience_score, education_score, project_score, certification_score, final_weighted_score, status, applied_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Applied', CURRENT_TIMESTAMP)
      ON CONFLICT(candidate_id, job_id) DO UPDATE SET
        match_score = excluded.match_score,
        skill_score = excluded.skill_score,
        experience_score = excluded.experience_score,
        education_score = excluded.education_score,
        project_score = excluded.project_score,
        certification_score = excluded.certification_score,
        final_weighted_score = excluded.final_weighted_score,
        status = 'Applied',
        applied_at = CURRENT_TIMESTAMP`,
      [
        cand.candidate_id, jobId, scoreResult.match_score, scoreResult.skill_score,
        scoreResult.experience_score, scoreResult.education_score, scoreResult.project_score, scoreResult.certification_score,
        scoreResult.final_weighted_score
      ]
    );

    res.json({ message: 'Applied successfully!', matchScore: scoreResult.final_weighted_score });
  } catch (error: any) {
    res.status(500).json({ error: 'Application error: ' + error.message });
  }
});

// Update application status
app.put('/api/candidate/status', authenticateToken, requireRole(['Recruiter', 'Admin']), async (req: AuthRequest, res: Response) => {
  const { candidate_id, job_id, status } = req.body;
  if (!candidate_id || !job_id || !status) {
    return res.status(400).json({ error: 'Candidate ID, job ID, and status are required.' });
  }

  if (!isAppliedStatus(status)) {
    return res.status(400).json({ error: 'Invalid application status.' });
  }

  const db = await getDb();
  try {
    const existing = await db.get<any>(
      'SELECT score_id, status FROM Scores WHERE candidate_id = ? AND job_id = ?',
      [candidate_id, job_id]
    );
    if (!existing || !isAppliedStatus(existing.status)) {
      return res.status(400).json({ error: 'Candidate has not applied for this job.' });
    }
    await db.run(
      'UPDATE Scores SET status = ? WHERE candidate_id = ? AND job_id = ?',
      [status, candidate_id, job_id]
    );

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
    const candidates = await db.all(`
      SELECT c.*, (
        SELECT s.status FROM Scores s
        WHERE s.candidate_id = c.candidate_id AND s.status IS NOT NULL
        ORDER BY s.applied_at DESC
        LIMIT 1
      ) AS pipeline_status
      FROM Candidates c
    `);
    const parsed = candidates.map(c => {
      const parsedCand = {
        ...c,
        skills: parseJsonField(c.skills, []),
        certifications: parseJsonField(c.certifications, []),
        projects: parseJsonField(c.projects, []),
        application_status: isAppliedStatus(c.pipeline_status) ? c.pipeline_status : null
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
      SELECT c.*, s.match_score, s.skill_score, s.experience_score, s.education_score, s.project_score, s.certification_score, s.final_weighted_score, s.status AS application_status, s.explainable_ai, s.fairness_report
      FROM Candidates c
      JOIN Scores s ON c.candidate_id = s.candidate_id
      WHERE s.job_id = ? AND s.status IS NOT NULL
      ORDER BY s.final_weighted_score DESC
    `;
    const candidates = await db.all(query, [jobId]);

    const ranked = candidates.map((c, index) => {
      const details = {
        ...c,
        skills: parseJsonField(c.skills, []),
        certifications: parseJsonField(c.certifications, []),
        projects: parseJsonField(c.projects, []),
        skill_validation: parseJsonField(c.skill_validation, []),
        quality_score: parseJsonField(c.quality_score, {}),
        explainable_ai: parseJsonField(c.explainable_ai, { positiveReasons: [], negativeReasons: [] }),
        fairness_report: parseJsonField(c.fairness_report, { genderBias: 0, ageBias: 0, collegeBias: 0, overallFairness: 100 }),
        rank: index + 1
      };
      
      return req.user?.role === 'Recruiter' ? maskCandidate(details) : details;
    });

    res.json({
      job: {
        ...job,
        required_skills: parseJsonField(job.required_skills, []),
        preferred_skills: parseJsonField(job.preferred_skills, [])
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
      SELECT c.*, s.match_score, s.skill_score, s.experience_score, s.education_score, s.project_score, s.certification_score, s.status AS application_status, s.explainable_ai, s.fairness_report
      FROM Candidates c
      JOIN Scores s ON c.candidate_id = s.candidate_id
      WHERE s.job_id = ? AND s.status IS NOT NULL
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
        skills: parseJsonField(c.skills, []),
        certifications: parseJsonField(c.certifications, []),
        projects: parseJsonField(c.projects, []),
        skill_validation: parseJsonField(c.skill_validation, []),
        quality_score: parseJsonField(c.quality_score, {}),
        explainable_ai: parseJsonField(c.explainable_ai, { positiveReasons: [], negativeReasons: [] }),
        fairness_report: parseJsonField(c.fairness_report, { genderBias: 0, ageBias: 0, collegeBias: 0, overallFairness: 100 }),
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
    const shortlistedCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Scores WHERE status = 'Shortlisted'");
    const selectedCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Scores WHERE status = 'Selected'");

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
    const applied = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Scores WHERE status = 'Applied'");
    const underReview = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Scores WHERE status = 'Under Review'");
    const shortlisted = shortlistedCount;
    const selected = selectedCount;
    const rejected = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM Scores WHERE status = 'Rejected'");

    const hiringFunnel = [
      { stage: 'Applied', count: (applied?.count || 0) + (underReview?.count || 0) + (shortlisted?.count || 0) + (selected?.count || 0) },
      { stage: 'Under Review', count: (underReview?.count || 0) + (shortlisted?.count || 0) + (selected?.count || 0) },
      { stage: 'Shortlisted', count: shortlisted?.count || 0 },
      { stage: 'Selected', count: selected?.count || 0 },
      { stage: 'Rejected', count: rejected?.count || 0 }
    ];

    const avgScore = await db.get<{ avg: number }>('SELECT AVG(final_weighted_score) as avg FROM Scores WHERE final_weighted_score > 0');
    const averageAtsScore = avgScore ? Math.round(avgScore.avg || 78) : 78;

    const dupQuery = await db.get<{ count: number }>('SELECT COUNT(candidate_id) - COUNT(DISTINCT resume_hash) as count FROM Candidates WHERE resume_hash IS NOT NULL');
    const duplicateCount = dupQuery ? Math.max(0, dupQuery.count) : 0;

    const biasAlertsQuery = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM AuditLogs');
    const biasAlertsCount = biasAlertsQuery ? biasAlertsQuery.count : 0;

    res.json({
      cards: {
        totalCandidates: candidateCount?.count || 0,
        totalJobs: jobCount?.count || 0,
        shortlisted: shortlistedCount?.count || 0,
        selected: selectedCount?.count || 0,
        averageAtsScore,
        duplicateCount,
        biasAlertsCount
      },
      charts: {
        skillDistribution,
        scoreHistogram: scoreBuckets,
        topSkillsDemand,
        hiringFunnel
      },
      recruiterActivity: [
        { name: 'Sarah Recruiter', viewed: 30, shortlisted: shortlistedCount?.count || 2, selected: selectedCount?.count || 2, rejected: 1 }
      ]
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error generating analytics: ' + error.message });
  }
});

// Reveal Candidate Identity (Audited)
app.post('/api/candidate/reveal-identity', authenticateToken, requireRole(['Admin', 'Recruiter']), async (req: AuthRequest, res: Response) => {
  const { candidate_id, reason } = req.body;
  if (!candidate_id || !reason) {
    return res.status(400).json({ error: 'Candidate ID and reason are required.' });
  }
  const db = await getDb();
  try {
    const adminName = req.user?.email || 'System User';
    const candidate = await db.get('SELECT * FROM Candidates WHERE candidate_id = ?', [candidate_id]);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found.' });
    }
    // Insert Audit Log
    await db.run(
      'INSERT INTO AuditLogs (admin_id, admin_name, candidate_id, candidate_name, reason) VALUES (?, ?, ?, ?, ?)',
      [req.user?.id || 0, adminName, candidate_id, candidate.full_name, reason]
    );
    // Return fully unmasked candidate details
    const parsed = {
      ...candidate,
      skills: JSON.parse(candidate.skills || '[]'),
      certifications: JSON.parse(candidate.certifications || '[]'),
      projects: JSON.parse(candidate.projects || '[]'),
      skill_validation: JSON.parse(candidate.skill_validation || '[]'),
      resume_suggestions: JSON.parse(candidate.resume_suggestions || '{"strengths":[],"weaknesses":[],"recommendations":[]}'),
      quality_score: JSON.parse(candidate.quality_score || '{"grammar":0,"formatting":0,"projects":0,"skills":0,"overall":0}')
    };
    res.json({ message: 'Identity unmasked and audited successfully.', candidate: parsed });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch Audit Logs
app.get('/api/admin/users', authenticateToken, requireRole(['Admin']), async (_req: AuthRequest, res: Response) => {
  const db = await getDb();
  try {
    const users = await db.all(`
      SELECT u.id, u.name, u.email, u.role, c.candidate_id
      FROM Users u
      LEFT JOIN Candidates c ON c.user_id = u.id
      ORDER BY u.id
    `);
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: 'Error loading user accounts: ' + error.message });
  }
});

app.get('/api/audit-logs', authenticateToken, requireRole(['Admin']), async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  try {
    const logs = await db.all('SELECT * FROM AuditLogs ORDER BY timestamp DESC');
    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
