import { initDb, getDb } from './db';
import { parseResumeText } from './services/nlpParser';
import { calculateMatchScore } from './services/scoreEngine';

async function runTests() {
  console.log('--- STARTING BACKEND TESTS ---');

  try {
    // 1. Initialize DB and Verify Seed Data
    console.log('\n[TEST 1] Initializing DB...');
    await initDb();
    const db = await getDb();

    console.log('Fetching seeded users...');
    const users = await db.all('SELECT id, name, email, role FROM Users');
    console.log(`Found ${users.length} seeded users:`, users.map(u => `${u.name} (${u.role})`));

    console.log('Fetching seeded jobs...');
    const jobs = await db.all('SELECT job_id, job_title, required_skills FROM Jobs');
    console.log(`Found ${jobs.length} seeded jobs:`, jobs.map(j => j.job_title));

    console.log('Fetching seeded candidates...');
    const candidates = await db.all('SELECT candidate_id, full_name, cgpa, experience_years, skills FROM Candidates');
    console.log(`Found ${candidates.length} seeded candidates:`, candidates.map(c => `${c.full_name} (${c.experience_years} yrs exp)`));

    // 2. Test Parser
    console.log('\n[TEST 2] Testing NLP Parser on Mock Text...');
    const mockResumeText = `
      JOHNATHAN DOE
      Email: johnathan.doe@gmail.com
      Phone: (123) 456-7890
      GitHub: github.com/johndoe-dev
      LinkedIn: linkedin.com/in/johnathan-doe

      Education:
      Bachelor of Technology in Computer Science and Engineering
      Indian Institute of Technology, Delhi
      CGPA: 8.9 / 10

      Skills:
      Java, Python, React, SQL, Spring Boot, Docker, Git, REST API.
      Problem Solving, Teamwork, Communication.

      Experience:
      Software Engineering Intern
      ACME Corp, Bangalore (June 2021 - June 2023)
      - Developed REST APIs in Spring Boot.
      - Built interactive frontend using React.
      - Experience: 2 years of software engineering.

      Certifications:
      AWS Certified Cloud Practitioner (2022)
    `;

    const parsed = parseResumeText(mockResumeText);
    console.log('Extracted Email:', parsed.email);
    console.log('Extracted Phone:', parsed.phone);
    console.log('Extracted Skills:', parsed.skills.technical);
    console.log('Extracted Education College:', parsed.education[0]?.college);
    console.log('Extracted CGPA:', parsed.education[0]?.cgpa);
    console.log('Extracted Experience Years:', parsed.experienceYears);

    if (parsed.email !== 'johnathan.doe@gmail.com') throw new Error('Email extraction failed');
    if (parsed.education[0]?.cgpa !== 8.9) throw new Error('CGPA extraction failed');
    if (!parsed.skills.technical.includes('Java')) throw new Error('Skills extraction failed');
    console.log('✔ Parser tests passed!');

    // 3. Test Scoring Engine
    console.log('\n[TEST 3] Testing Scoring Engine Math...');
    
    // Job requires Java, Spring Boot, SQL, AWS, Docker
    const mockJob = {
      required_skills: ['Java', 'Spring Boot', 'SQL', 'AWS', 'Docker'],
      preferred_skills: ['React'],
      experience_required: 3,
      min_cgpa: 8.0
    };

    // Candidate has Java, SQL, React (2 matched of 5 required)
    // Exp: 3 years (meets requirement)
    // CGPA: 8.5 (meets requirement)
    // Projects: 2
    // Certifications: 1
    const mockCand = {
      skills: ['Java', 'SQL', 'React'],
      experience_years: 3,
      cgpa: 8.5,
      projects: [{ name: 'Proj1', desc: 'Desc1' }, { name: 'Proj2', desc: 'Desc2' }],
      certifications: ['Cert1']
    };

    const scores = calculateMatchScore(mockCand, mockJob);
    console.log('Scoring Results:', scores);
    
    console.log('Skill score (expected 40%):', scores.skill_score);
    console.log('Experience score (expected 100%):', scores.experience_score);
    console.log('Education score (expected >= 80%):', scores.education_score);
    console.log('Projects score (expected ~66%):', scores.project_score);
    console.log('Certifications score (expected 50%):', scores.certification_score);
    console.log('Final Weighted Score (expected ~61%):', scores.final_weighted_score);

    if (scores.skill_score !== 40) throw new Error('Skill score calculation mismatch');
    if (scores.experience_score !== 100) throw new Error('Experience score calculation mismatch');
    console.log('✔ Scoring engine tests passed!');

    console.log('\n--- ALL BACKEND TESTS COMPLETED SUCCESSFULLY ---');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ BACKEND TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
