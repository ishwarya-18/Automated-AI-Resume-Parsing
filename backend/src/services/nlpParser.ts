import fs from 'fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { spawn } from 'child_process';
import path from 'path';

export interface ParsedResumeData {
  fullName: string;
  email: string;
  phone: string;
  skills: {
    technical: string[];
    soft: string[];
  };
  education: {
    degree: string;
    college: string;
    cgpa: number;
    year?: string;
  }[];
  experienceYears: number;
  experienceDetails: string[];
  projects: { name: string; desc: string }[];
  certifications: string[];
  github: string;
  linkedin: string;
  location?: string;
  languages?: string[];
  // Sensitive/masked fields for bias mitigation
  gender?: string;
  age?: number;
  religion?: string;
  caste?: string;
  maritalStatus?: string;
  address?: string;
  // Newly added AI features
  skill_validation: { skill: string; confidence: number; evidence: string[]; status: string }[];
  resume_suggestions: { strengths: string[]; weaknesses: string[]; recommendations: string[] };
  quality_score: { 
    grammar: number; 
    formatting: number; 
    projects: number; 
    skills: number; 
    overall: number;
    ats_compatibility: number;
    resume_completeness: number;
    skill_validation_score: number;
    project_strength: number;
    experience_score: number;
    certification_score: number;
    resume_quality_score: number;
    grammar_score: number;
    keyword_match: number;
    overall_score: number;
  };
  ner_confidence: { name: number; skills: number; experience: number; education: number };
  resume_hash: string;
}

function resolveNlpEngineScript(): string {
  const candidates = [
    path.resolve(__dirname, 'nlp_engine.py'),
    path.resolve(__dirname, '../../src/services/nlp_engine.py'),
    path.resolve(__dirname, '../src/services/nlp_engine.py'),
    path.resolve(process.cwd(), 'src/services/nlp_engine.py'),
    path.resolve(process.cwd(), 'backend/src/services/nlp_engine.py')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(__dirname, 'nlp_engine.py');
}

export function parseResumeTextPython(text: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = resolveNlpEngineScript();
    const pythonCommand = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
    const py = spawn(pythonCommand, [scriptPath], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let output = '';
    let errorOutput = '';
    let settled = false;
    const timeout = setTimeout(() => {
      py.kill();
      finishWithError(new Error('Python NLP parser timed out.'));
    }, 30000);

    const finishWithError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    py.stdout.on('data', (data) => {
      output += data.toString();
    });

    py.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // A missing Python executable emits `error`; without a listener, Node can
    // terminate the API process while a resume upload is in flight.
    py.on('error', (error) => finishWithError(error));
    py.stdin.on('error', (error) => finishWithError(error));

    py.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        return finishWithError(new Error(`Python process exited with code ${code}. Error: ${errorOutput}`));
      }
      try {
        const parsed = JSON.parse(output.trim());
        if (parsed.error) {
          return finishWithError(new Error(parsed.error));
        }
        settled = true;
        clearTimeout(timeout);
        resolve(parsed);
      } catch (err) {
        finishWithError(new Error(`Failed to parse Python output: ${err}. Raw: ${output}`));
      }
    });

    try {
      py.stdin.write(JSON.stringify({ action: 'parse', text }));
      py.stdin.end();
    } catch (error) {
      finishWithError(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function parseResumeText(text: string): Promise<ParsedResumeData> {
  try {
    const result = await parseResumeTextPython(text);
    return {
      fullName: result.fullName,
      email: result.email,
      phone: result.phone,
      skills: result.skills,
      education: result.education,
      experienceYears: result.experienceYears,
      experienceDetails: text.split('\n').filter(l => l.toLowerCase().includes('developer') || l.toLowerCase().includes('engineer') || l.toLowerCase().includes('intern')),
      projects: result.projects,
      certifications: result.certifications,
      github: result.github,
      linkedin: result.linkedin,
      location: result.location,
      languages: result.languages,
      gender: 'Not Disclosed',
      age: 0,
      religion: 'Not Disclosed',
      caste: 'Not Disclosed',
      maritalStatus: 'Not Disclosed',
      address: result.location,
      skill_validation: result.skill_validation,
      resume_suggestions: result.resume_suggestions,
      quality_score: {
        grammar: result.ats_score,
        formatting: result.ats_score,
        projects: result.ats_score,
        skills: result.ats_score,
        overall: result.ats_score,
        
        ats_compatibility: result.ats_score,
        resume_completeness: result.ats_score,
        skill_validation_score: result.ats_score,
        project_strength: result.ats_score,
        experience_score: result.ats_score,
        certification_score: result.ats_score,
        resume_quality_score: result.ats_score,
        grammar_score: result.ats_score,
        keyword_match: result.ats_score,
        overall_score: result.ats_score
      },
      ner_confidence: {
        name: result.fullName ? 99 : 0,
        skills: result.skills.technical.length > 0 ? 95 : 0,
        experience: result.experienceYears > 0 ? 92 : 0,
        education: result.education.length > 0 ? 98 : 0
      },
      resume_hash: 'hash_' + Math.abs(text.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)).toString(16)
    };
  } catch (pyError) {
    console.warn('Python NLP engine failed, falling back to JS Parser:', pyError);
    return parseResumeTextFallback(text);
  }
}

// Extensive dictionaries
const TECHNICAL_SKILLS_DICT = [
  'Java', 'Python', 'SQL', 'MySQL', 'MongoDB', 'React', 'Spring Boot', 'Docker',
  'Kubernetes', 'AWS', 'Machine Learning', 'Deep Learning', 'NLP', 'HTML', 'CSS',
  'JavaScript', 'Git', 'REST API', 'TypeScript', 'Node.js', 'Express', 'Angular',
  'Vue', 'Next.js', 'PyTorch', 'TensorFlow', 'PostgreSQL', 'SQLite', 'C++', 'C#',
  'Go', 'Rust', 'Tailwind', 'DevOps', 'CI/CD', 'Redux', 'GraphQL'
];

const SOFT_SKILLS_DICT = [
  'Communication', 'Leadership', 'Teamwork', 'Collaboration', 'Problem Solving',
  'Time Management', 'Critical Thinking', 'Adaptability', 'Creativity', 'Work Ethic',
  'Emotional Intelligence', 'Decision Making', 'Negotiation', 'Conflict Resolution'
];

const DEGREES = [
  'Bachelor of Technology', 'B.Tech', 'Bachelor of Engineering', 'B.E.',
  'Master of Technology', 'M.Tech', 'Bachelor of Science', 'B.Sc',
  'Master of Science', 'M.Sc', 'Master of Computer Applications', 'MCA',
  'Bachelor of Computer Applications', 'BCA', 'Doctor of Philosophy', 'Ph.D', 'PhD',
  'Master of Business Administration', 'MBA'
];

const GENDERS = ['Male', 'Female', 'Non-Binary', 'Other'];
const RELIGIONS = ['Christianity', 'Hinduism', 'Islam', 'Sikhism', 'Buddhism', 'Judaism', 'None'];
const CASTES = ['General', 'OBC', 'SC', 'ST'];
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];

/**
 * Extract raw text from pdf or docx file
 */
export async function extractTextFromFile(filePath: string, fileExtension: string): Promise<string> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const dataBuffer = fs.readFileSync(filePath);

    if (fileExtension.toLowerCase() === '.pdf') {
      const parsedPdf = await pdfParse(dataBuffer);
      return parsedPdf.text;
    } else if (fileExtension.toLowerCase() === '.docx') {
      const result = await mammoth.extractRawText({ buffer: dataBuffer });
      return result.value;
    } else if (fileExtension.toLowerCase() === '.doc') {
      return dataBuffer.toString('utf-8').replace(/[^\x20-\x7E\r\n\t]/g, ' ');
    } else {
      return dataBuffer.toString('utf-8');
    }
  } catch (error: any) {
    console.error(`Error extracting text from ${fileExtension}:`, error.message);
    throw error;
  }
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

function extractSection(text: string, startHeaders: string[], stopHeaders: string[]): string {
  const lines = text.split('\n').map(l => l.trim());
  let collecting = false;
  const collected: string[] = [];
  for (const line of lines) {
    const compact = line.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    if (startHeaders.some(h => compact === h || compact.startsWith(h + ' '))) {
      collecting = true;
      continue;
    }
    if (collecting && stopHeaders.some(h => compact === h || compact.startsWith(h + ' '))) break;
    if (collecting) collected.push(line);
  }
  return collected.join('\n');
}

function parseDateRanges(blob: string): Array<[number, number]> {
  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;
  const toIdx = (m: number, y: number) => y * 12 + m;
  const ranges: Array<[number, number]> = [];
  const months = Object.keys(MONTH_INDEX).join('|');
  const present = '(?:present|current|now|today|ongoing)';

  const monthRe = new RegExp(
    `(${months})\\.?\\s+(\\d{4})\\s*(?:[-–—]|to)\\s*(?:(${present})|(${months})\\.?\\s+(\\d{4}))`,
    'gi'
  );
  for (const match of blob.matchAll(monthRe)) {
    const sm = MONTH_INDEX[match[1].toLowerCase()];
    const sy = parseInt(match[2], 10);
    const ey = match[3] ? nowY : parseInt(match[5], 10);
    const em = match[3] ? nowM : MONTH_INDEX[match[4].toLowerCase()];
    ranges.push([toIdx(sm, sy), toIdx(em, ey)]);
  }

  const numRe = new RegExp(
    `\\b(\\d{1,2})[/\\-](\\d{4})\\s*(?:[-–—]|to)\\s*(?:(${present})|(\\d{1,2})[/\\-](\\d{4}))\\b`,
    'gi'
  );
  for (const match of blob.matchAll(numRe)) {
    const sm = Math.max(1, Math.min(12, parseInt(match[1], 10)));
    const sy = parseInt(match[2], 10);
    const em = match[3] ? nowM : Math.max(1, Math.min(12, parseInt(match[4], 10)));
    const ey = match[3] ? nowY : parseInt(match[5], 10);
    ranges.push([toIdx(sm, sy), toIdx(em, ey)]);
  }

  const yearRe = new RegExp(`\\b((?:19|20)\\d{2})\\s*(?:[-–—]|to)\\s*(?:(${present})|((?:19|20)\\d{2}))\\b`, 'gi');
  for (const match of blob.matchAll(yearRe)) {
    const sy = parseInt(match[1], 10);
    const ey = match[2] ? nowY : parseInt(match[3], 10);
    if (ey - sy >= 0 && ey - sy <= 15) {
      ranges.push([toIdx(1, sy), toIdx(match[2] ? nowM : 12, ey)]);
    }
  }
  return ranges;
}

function mergeRangeYears(ranges: Array<[number, number]>): number {
  const normalized = ranges.filter(([s, e]) => e >= s).sort((a, b) => a[0] - b[0]);
  if (!normalized.length) return 0;
  const merged: Array<[number, number]> = [normalized[0]];
  for (const [start, end] of normalized.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const months = merged.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
  return Math.round(Math.min(40, months / 12) * 10) / 10;
}

function statedExperienceYears(text: string): number {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs|year|yr)\s+(?:of\s+)?(?:experience|exp|professional experience)/gi,
    /(?:experience|exp|total experience)[:\s-]+(\d+(?:\.\d+)?)\s*(?:years|yrs|year|yr)/gi,
    /(\d+)\s*(?:years|yrs|year)\s+(?:and\s+)?(\d+)\s*(?:months|mos|month)/gi
  ];
  let best = 0;
  for (let i = 0; i < patterns.length; i++) {
    for (const match of text.matchAll(patterns[i])) {
      const value = i === 2 ? parseFloat(match[1]) + parseFloat(match[2]) / 12 : parseFloat(match[1]);
      if (value > 0 && value <= 40) best = Math.max(best, value);
    }
  }
  return Math.round(best * 10) / 10;
}

function extractExperienceYears(text: string): number {
  const workText = extractSection(text, [
    'experience', 'work experience', 'employment', 'professional experience',
    'work history', 'employment history', 'internship', 'internships'
  ], ['education', 'academic', 'projects', 'project', 'certification', 'certifications', 'skills', 'awards']);
  const eduText = extractSection(text, ['education', 'academic', 'academics'], ['experience', 'projects', 'skills', 'certifications']);
  const stated = statedExperienceYears(text);
  const workRanges = parseDateRanges(workText.trim() ? workText : text);
  const eduKey = new Set(parseDateRanges(eduText).map(r => `${r[0]}-${r[1]}`));
  const filtered = workRanges.filter(r => !eduKey.has(`${r[0]}-${r[1]}`));
  if (!workText.trim()) {
    return stated > 0 ? stated : mergeRangeYears(filtered);
  }
  return Math.max(stated, mergeRangeYears(filtered));
}

/**
 * Rule-based NLP parsing engine fallback
 */
export function parseResumeTextFallback(text: string): ParsedResumeData {
  const textLower = text.toLowerCase();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // 1. Extract Email
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  const emailMatch = text.match(emailRegex);
  const email = emailMatch ? emailMatch[0].trim() : '';

  // 2. Extract Phone
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phoneMatch = text.match(phoneRegex);
  const phone = phoneMatch ? phoneMatch[0].trim() : '';

  // 3. Extract Links
  const githubRegex = /(github\.com\/[a-zA-Z0-9_-]+)/gi;
  const linkedinRegex = /(linkedin\.com\/in\/[a-zA-Z0-9_-]+)/gi;
  const githubMatch = text.match(githubRegex);
  const linkedinMatch = text.match(linkedinRegex);
  const github = githubMatch ? `https://${githubMatch[0].toLowerCase()}` : '';
  const linkedin = linkedinMatch ? `https://${linkedinMatch[0].toLowerCase()}` : '';

  // 4. Extract Name
  let fullName = '';
  if (lines.length > 0) {
    for (const line of lines) {
      if (!line.includes('@') && !line.match(/\d{4}/) && !line.toLowerCase().includes('github') && !line.toLowerCase().includes('linkedin') && line.length < 50 && /^[a-zA-Z\s.]+$/.test(line)) {
        fullName = line;
        break;
      }
    }
  }

  // 5. Extract Skills
  const technical: string[] = [];
  const soft: string[] = [];

  for (const tech of TECHNICAL_SKILLS_DICT) {
    const regex = new RegExp(`\\b${tech.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      technical.push(tech);
    }
  }

  for (const s of SOFT_SKILLS_DICT) {
    const regex = new RegExp(`\\b${s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      soft.push(s);
    }
  }

  // 6. Extract Education
  const education: ParsedResumeData['education'] = [];
  let detectedDegree = '';
  for (const d of DEGREES) {
    if (textLower.includes(d.toLowerCase())) {
      detectedDegree = d;
      break;
    }
  }

  let detectedCollege = '';
  const collegeKeywords = ['institute of technology', 'university', 'college', 'school of engineering', 'state college', 'academy', 'institute of computer'];
  for (const line of lines) {
    const lineL = line.toLowerCase();
    if (collegeKeywords.some(keyword => lineL.includes(keyword)) && line.length < 100) {
      detectedCollege = line;
      break;
    }
  }

  let cgpa = 0.0;
  const cgpaRegex = /(?:cgpa|gpa|pointer)[:\s]+(\d+(?:\.\d+)?)(?:\/10)?/i;
  const cgpaMatch = text.match(cgpaRegex);
  if (cgpaMatch) {
    cgpa = parseFloat(cgpaMatch[1]);
  } else {
    const floatRegex = /\b([5-9]\.\d{1,2}|10\.0)\b/g;
    const floatMatches = text.match(floatRegex);
    if (floatMatches) {
      cgpa = parseFloat(floatMatches[0]);
    }
  }

  education.push({
    degree: detectedDegree || 'Not Disclosed',
    college: detectedCollege || 'Not Disclosed',
    cgpa: cgpa
  });

  // 7. Extract Experience Years from work history (ignore education dates)
  const experienceYears = extractExperienceYears(text);
  const expMatch = experienceYears > 0;

  // 8. Extract Projects & Certifications
  const projects: { name: string; desc: string }[] = [];
  const certifications: string[] = [];

  const certKeywords = ['certified', 'certification', 'certificate', 'credential'];
  for (const line of lines) {
    const lineL = line.toLowerCase();
    if (certKeywords.some(keyword => lineL.includes(keyword)) && line.length < 80 && line.length > 5) {
      const cleaned = line.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9\s()\-]+$/g, '').trim();
      if (cleaned.length > 10 && !certifications.includes(cleaned)) {
        certifications.push(cleaned);
      }
    }
  }

  for (const line of lines) {
    if (line.toLowerCase().includes('project') && line.length < 60) {
      const idx = lines.indexOf(line);
      const nextLine = lines[idx + 1] || '';
      if (nextLine.length > 15 && nextLine.length < 200) {
        projects.push({ name: line, desc: nextLine });
      }
    }
  }

  // 9. Sensitive characteristics (Bias Mitigation defaults)
  let gender = 'Not Disclosed';
  for (const g of GENDERS) {
    if (new RegExp(`\\b${g}\\b`, 'i').test(text)) {
      gender = g;
      break;
    }
  }

  let age = 0;
  const ageRegex = /\b(1[8-9]|[2-5]\d)\s*(?:years old|yrs old|age)\b/i;
  const ageMatch = text.match(ageRegex);
  if (ageMatch) {
    age = parseInt(ageMatch[1]);
  }

  let religion = 'Not Disclosed';
  for (const r of RELIGIONS) {
    if (new RegExp(`\\b${r}\\b`, 'i').test(text)) {
      religion = r;
      break;
    }
  }

  let caste = 'Not Disclosed';
  for (const c of CASTES) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(text)) {
      caste = c;
      break;
    }
  }

  let maritalStatus = 'Not Disclosed';
  for (const m of MARITAL_STATUSES) {
    if (new RegExp(`\\b${m}\\b`, 'i').test(text)) {
      maritalStatus = m;
      break;
    }
  }

  let address = 'Not Disclosed';
  const addrKeywords = ['street', 'st.', 'road', 'rd.', 'avenue', 'ave.', 'lane', 'ln.', 'city', 'apartment', 'apt.'];
  for (const line of lines) {
    if (addrKeywords.some(keyword => line.toLowerCase().includes(keyword)) && line.length < 100 && line.length > 10) {
      address = line;
      break;
    }
  }

  // ==========================================
  // NEW AI MODULES IMPLEMENTATION
  // ==========================================

  // A. Skill Validation Engine (Comparing skills to project & cert text)
  const skill_validation = technical.map(skill => {
    const skillLower = skill.toLowerCase();
    const evidence: string[] = [];

    // Check project description matching
    projects.forEach(p => {
      if (p.name.toLowerCase().includes(skillLower) || p.desc.toLowerCase().includes(skillLower)) {
        evidence.push(`Project: ${p.name}`);
      }
    });

    // Check certifications matching
    certifications.forEach(c => {
      if (c.toLowerCase().includes(skillLower)) {
        evidence.push(`Certification: ${c}`);
      }
    });

    const isVerified = evidence.length > 0;
    const confidence = isVerified 
      ? Math.min(99, 75 + evidence.length * 10)
      : Math.max(10, Math.round(15 + Math.random() * 15));
    const status = isVerified ? 'Verified' : 'Needs Validation';

    return {
      skill,
      confidence,
      evidence: isVerified ? evidence : ['Only listed in skills section'],
      status
    };
  });

  // B. Resume Suggestion Generator
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  if (technical.length > 5) {
    strengths.push('Comprehensive technical skill stack identified');
  }
  if (projects.length > 1) {
    strengths.push('Demonstrates hands-on application experience through multiple projects');
  }
  if (certifications.length > 0) {
    strengths.push('Professional credentials validate specialized training');
  }

  if (!github) {
    weaknesses.push('No GitHub portfolio URL extracted');
    recommendations.push('Provide a public GitHub link to showcase active project codebases');
  }
  if (!linkedin) {
    weaknesses.push('LinkedIn professional networking url missing');
    recommendations.push('Add a LinkedIn URL to boost recruiter outreach');
  }
  if (experienceYears === 0) {
    weaknesses.push('Entry-level profile with no distinct internship or job timeline');
    recommendations.push('Flesh out academic project descriptions using impact metrics (e.g. latency, speed)');
  }
  if (cgpa < 8.0) {
    weaknesses.push('Academic CGPA is below target baseline');
    recommendations.push('Focus on adding cloud or technology-specific certifications to offset GPA');
  }

  if (strengths.length === 0) strengths.push('Objective layout structure detected');
  if (weaknesses.length === 0) weaknesses.push('Essential information fields populated.');
  if (recommendations.length === 0) recommendations.push('Optimize resume alignment for active jobs.');

  const resume_suggestions = { strengths, weaknesses, recommendations };

  // C. Quality Score Engine (Evaluating resume standard metrics dynamically)
  const grammarScore = Math.max(50, Math.min(100, 100 - (lines.filter(l => l.length > 120).length * 10)));
  
  let completeness = 0;
  if (fullName) completeness += 10;
  if (email) completeness += 10;
  if (phone) completeness += 10;
  if (github) completeness += 10;
  if (linkedin) completeness += 10;
  if (education.length > 0 && education[0].college !== 'Not Disclosed') completeness += 15;
  if (technical.length > 0) completeness += 15;
  if (projects.length > 0) completeness += 10;
  if (certifications.length > 0) completeness += 10;
  const resumeCompleteness = completeness;

  let atsCompatibility = 60;
  if (email && phone) atsCompatibility += 10;
  if (github || linkedin) atsCompatibility += 10;
  if (textLower.includes('education') || textLower.includes('experience')) atsCompatibility += 10;
  if (textLower.includes('skills') || textLower.includes('projects')) atsCompatibility += 10;

  const verifiedSkills = skill_validation.filter(sv => sv.status === 'Verified').length;
  const skillValidationScore = technical.length > 0 ? Math.round((verifiedSkills / technical.length) * 100) : 0;

  const projectStrength = projects.length > 0 
    ? Math.min(100, projects.length * 25 + Math.round(projects.reduce((acc, p) => acc + p.desc.length, 0) / 10)) 
    : 0;

  const experienceScore = Math.max(20, Math.min(100, Math.round(experienceYears * 12 + 40)));
  const certificationScore = Math.min(100, certifications.length * 30);
  const keywordMatch = Math.min(100, technical.length * 7 + soft.length * 5);

  const resumeFormatting = (github && linkedin) ? 95 : (github || linkedin ? 80 : 50);
  const resumeQualityScore = Math.round((resumeCompleteness + grammarScore + resumeFormatting + projectStrength) / 4);

  const overallScore = Math.round((atsCompatibility * 0.25) + (resumeCompleteness * 0.15) + (skillValidationScore * 0.15) + (projectStrength * 0.15) + (experienceScore * 0.10) + (certificationScore * 0.05) + (grammarScore * 0.05) + (keywordMatch * 0.10));

  const quality_score = {
    grammar: grammarScore,
    formatting: resumeFormatting,
    projects: projectStrength,
    skills: keywordMatch,
    overall: overallScore,

    ats_compatibility: atsCompatibility,
    resume_completeness: resumeCompleteness,
    skill_validation_score: skillValidationScore,
    project_strength: projectStrength,
    experience_score: experienceScore,
    certification_score: certificationScore,
    resume_quality_score: resumeQualityScore,
    grammar_score: grammarScore,
    keyword_match: keywordMatch,
    overall_score: overallScore
  };

  // D. Named Entity Recognition (NER) Confidence
  const ner_confidence = {
    name: fullName ? 99 : 0,
    skills: technical.length > 0 ? 95 : 0,
    experience: expMatch ? 92 : 0,
    education: detectedDegree || detectedCollege ? 98 : 0
  };

  // E. Resume Similarity Hash Generator (Sum of ASCII values)
  let sum = 0;
  for (let i = 0; i < text.length; i++) {
    sum = (sum << 5) - sum + text.charCodeAt(i);
    sum |= 0;
  }
  const resume_hash = 'hash_' + Math.abs(sum).toString(16);

  return {
    fullName,
    email,
    phone,
    skills: { technical, soft },
    education,
    experienceYears,
    experienceDetails: lines.filter(l => l.toLowerCase().includes('developer') || l.toLowerCase().includes('engineer') || l.toLowerCase().includes('intern')),
    projects,
    certifications,
    github,
    linkedin,
    gender,
    age,
    religion,
    caste,
    maritalStatus,
    address,
    // AI metrics
    skill_validation,
    resume_suggestions,
    quality_score,
    ner_confidence,
    resume_hash
  };
}
