export interface JobDetails {
  required_skills: string[]; // parsed from JSON
  preferred_skills: string[]; // parsed from JSON
  experience_required: number;
  min_cgpa: number;
}

export interface CandidateDetails {
  skills: string[]; // parsed from JSON
  experience_years: number;
  cgpa: number;
  projects: any[]; // parsed from JSON
  certifications: string[]; // parsed from JSON
}

export interface MatchingResult {
  match_score: number;
  skill_score: number;
  experience_score: number;
  education_score: number;
  project_score: number;
  certification_score: number;
  final_weighted_score: number;
  matched_skills: string[];
  missing_skills: string[];
}

/**
 * Calculates candidate matches against a job description.
 */
export function calculateMatchScore(
  candidate: CandidateDetails,
  job: JobDetails
): MatchingResult {
  // 1. Skill Score
  const jobReqSkills = job.required_skills.map(s => s.trim().toLowerCase());
  const candidateSkills = candidate.skills.map(s => s.trim().toLowerCase());

  const matchedSkillsRaw = job.required_skills.filter(skill =>
    candidateSkills.includes(skill.trim().toLowerCase())
  );
  
  const missing_skills = job.required_skills.filter(skill =>
    !candidateSkills.includes(skill.trim().toLowerCase())
  );

  const matched_skills = matchedSkillsRaw;
  const totalReqCount = jobReqSkills.length;
  
  const skill_score = totalReqCount > 0 
    ? Math.round((matched_skills.length / totalReqCount) * 100) 
    : 100;

  // 2. Experience Score
  let experience_score = 0;
  if (job.experience_required <= 0) {
    experience_score = 100;
  } else {
    experience_score = Math.round(
      Math.min(100, (candidate.experience_years / job.experience_required) * 100)
    );
  }

  // 3. Education Score
  // Scaled: CGPA relative to 10.0 (or 4.0 if small, but let's assume 10.0 scale)
  let baseCgpa = candidate.cgpa;
  if (baseCgpa <= 4.0 && baseCgpa > 0) {
    baseCgpa = baseCgpa * 2.5; // Scale 4.0 to 10.0 scale
  }
  
  let education_score = 0;
  if (job.min_cgpa <= 0) {
    education_score = Math.round(Math.min(100, (baseCgpa / 10.0) * 100));
  } else {
    // If CGPA meets requirement, higher base. Otherwise, relative.
    if (baseCgpa >= job.min_cgpa) {
      education_score = Math.round(80 + ((baseCgpa - job.min_cgpa) / (10 - job.min_cgpa)) * 20);
    } else {
      education_score = Math.round((baseCgpa / job.min_cgpa) * 80);
    }
  }
  education_score = Math.min(100, Math.max(0, education_score));

  // 4. Project Score
  // 30 points per project, capped at 100
  const projectCount = Array.isArray(candidate.projects) ? candidate.projects.length : 0;
  const project_score = Math.min(100, projectCount * 33);

  // 5. Certification Score
  // 50 points per certification, capped at 100
  const certCount = Array.isArray(candidate.certifications) ? candidate.certifications.length : 0;
  const certification_score = Math.min(100, certCount * 50);

  // 6. Weighted Score
  // Weights:
  // Skills Match = 50%
  // Experience = 20%
  // Education = 15%
  // Projects = 10%
  // Certifications = 5%
  const final_weighted_score = Math.round(
    0.50 * skill_score +
    0.20 * experience_score +
    0.15 * education_score +
    0.10 * project_score +
    0.05 * certification_score
  );

  return {
    match_score: skill_score, // Standard skill match score
    skill_score,
    experience_score,
    education_score,
    project_score,
    certification_score,
    final_weighted_score,
    matched_skills,
    missing_skills
  };
}
