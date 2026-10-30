import sys
import os
import json
import re
import math
from collections import Counter

# Force UTF-8 encoding on standard streams for Windows compatibility
if hasattr(sys.stdin, 'reconfigure'):
    sys.stdin.reconfigure(encoding='utf-8')
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


# Try importing spacy and sentence-transformers
try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
except Exception:
    nlp = None

try:
    from sentence_transformers import SentenceTransformer, util
    model = SentenceTransformer('all-MiniLM-L6-v2')
except Exception:
    model = None

# Extensive lists for fallback parsing
TECHNICAL_SKILLS = [
    'java', 'python', 'sql', 'mysql', 'mongodb', 'react', 'spring boot', 'docker',
    'kubernetes', 'aws', 'machine learning', 'deep learning', 'nlp', 'html', 'css',
    'javascript', 'git', 'rest api', 'typescript', 'node.js', 'express', 'angular',
    'vue', 'next.js', 'pytorch', 'tensor-flow', 'tensorflow', 'postgresql', 'sqlite', 'c++', 'c#',
    'go', 'rust', 'tailwind', 'devops', 'ci/cd', 'redux', 'graphql'
]

SOFT_SKILLS = [
    'communication', 'leadership', 'teamwork', 'collaboration', 'problem solving',
    'time management', 'critical thinking', 'adaptability', 'creativity', 'work ethic',
    'emotional intelligence', 'decision making', 'negotiation', 'conflict resolution'
]

DEGREES = [
    'bachelor of technology', 'b.tech', 'btech', 'bachelor of engineering', 'b.e.', 'be',
    'master of technology', 'm.tech', 'mtech', 'bachelor of science', 'b.sc', 'bsc',
    'master of science', 'm.sc', 'msc', 'master of computer applications', 'mca',
    'bachelor of computer applications', 'bca', 'doctor of philosophy', 'ph.d', 'phd',
    'master of business administration', 'mba'
]

COLLEGE_KEYWORDS = [
    'institute of technology', 'university', 'college', 'school of engineering',
    'state college', 'academy', 'institute of computer', 'school of science'
]

LANGUAGES = [
    'english', 'spanish', 'french', 'german', 'mandarin', 'chinese', 'japanese',
    'korean', 'russian', 'hindi', 'bengali', 'portuguese', 'arabic', 'italian'
]

MONTH_MAP = {
    'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
    'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
    'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
}

WORK_SECTION_HEADERS = (
    'experience', 'work experience', 'employment', 'professional experience',
    'work history', 'employment history', 'internship', 'internships',
    'career', 'professional history'
)
EDU_SECTION_HEADERS = (
    'education', 'academic', 'academics', 'qualifications', 'scholastic'
)
SECTION_STOP_HEADERS = (
    'education', 'academic', 'projects', 'project', 'certification', 'certifications',
    'skills', 'technical skills', 'awards', 'publications', 'summary', 'objective',
    'languages', 'interests', 'hobbies', 'declaration', 'references'
)


def _current_year_month():
    from datetime import datetime
    now = datetime.now()
    return now.year, now.month


def _extract_section(text, start_headers, stop_headers):
    lines = [l.strip() for l in text.split('\n')]
    collecting = False
    collected = []
    for line in lines:
        compact = re.sub(r'[^a-z]+', ' ', line.lower()).strip()
        if any(compact == h or compact.startswith(h + ' ') for h in start_headers):
            collecting = True
            continue
        if collecting and any(compact == h or compact.startswith(h + ' ') for h in stop_headers):
            break
        if collecting:
            collected.append(line)
    return '\n'.join(collected)


def _month_year_to_index(month, year):
    return year * 12 + month


def _parse_date_ranges(blob):
    now_y, now_m = _current_year_month()
    ranges = []
    month_names = '|'.join(MONTH_MAP.keys())
    present = r'(?:present|current|now|today|ongoing)'

    pattern_month = re.compile(
        rf'({month_names})\.?\s+(\d{{4}})\s*(?:[-–—]|to)\s*(?:({present})|(({month_names})\.?\s+(\d{{4}})))',
        re.IGNORECASE
    )
    for match in pattern_month.finditer(blob):
        sm = MONTH_MAP[match.group(1).lower()]
        sy = int(match.group(2))
        if match.group(3):
            ey, em = now_y, now_m
        else:
            em = MONTH_MAP[match.group(5).lower()]
            ey = int(match.group(6))
        ranges.append((_month_year_to_index(sm, sy), _month_year_to_index(em, ey)))

    pattern_numeric = re.compile(
        rf'\b(\d{{1,2}})[/\-](\d{{4}})\s*(?:[-–—]|to)\s*(?:({present})|(\d{{1,2}})[/\-](\d{{4}}))\b',
        re.IGNORECASE
    )
    for match in pattern_numeric.finditer(blob):
        sm = max(1, min(12, int(match.group(1))))
        sy = int(match.group(2))
        if match.group(3):
            ey, em = now_y, now_m
        else:
            em = max(1, min(12, int(match.group(4))))
            ey = int(match.group(5))
        ranges.append((_month_year_to_index(sm, sy), _month_year_to_index(em, ey)))

    pattern_year = re.compile(
        rf'\b((?:19|20)\d{{2}})\s*(?:[-–—]|to)\s*(?:({present})|((?:19|20)\d{{2}}))\b',
        re.IGNORECASE
    )
    for match in pattern_year.finditer(blob):
        sy = int(match.group(1))
        if match.group(2):
            ey = now_y
        else:
            ey = int(match.group(3))
        if 0 <= ey - sy <= 15:
            ranges.append((_month_year_to_index(1, sy), _month_year_to_index(now_m if match.group(2) else 12, ey)))
    return ranges


def _merge_range_years(ranges):
    if not ranges:
        return 0.0
    normalized = []
    for start, end in ranges:
        if end < start:
            continue
        normalized.append((start, end))
    if not normalized:
        return 0.0
    normalized.sort()
    merged = [normalized[0]]
    for start, end in normalized[1:]:
        last_s, last_e = merged[-1]
        if start <= last_e + 1:
            merged[-1] = (last_s, max(last_e, end))
        else:
            merged.append((start, end))
    months = sum(end - start + 1 for start, end in merged)
    return round(min(40.0, months / 12.0), 1)


def _stated_experience_years(text):
    patterns = [
        r'(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs|year|yr)\s+(?:of\s+)?(?:experience|exp|professional experience)',
        r'(?:experience|exp|total experience)[:\s-]+(\d+(?:\.\d+)?)\s*(?:years|yrs|year|yr)',
        r'(\d+)\s*(?:years|yrs|year)\s+(?:and\s+)?(\d+)\s*(?:months|mos|month)',
        r'(?:over|more than)\s+(\d+(?:\.\d+)?)\s*(?:years|yrs|year)'
    ]
    best = 0.0
    for idx, pat in enumerate(patterns):
        for match in re.finditer(pat, text, re.IGNORECASE):
            if idx == 2:
                value = float(match.group(1)) + float(match.group(2)) / 12.0
            else:
                value = float(match.group(1))
            if 0 < value <= 40:
                best = max(best, value)
    return round(best, 1)


def extract_experience_years(text, lines):
    work_text = _extract_section(text, WORK_SECTION_HEADERS, SECTION_STOP_HEADERS)
    edu_text = _extract_section(text, EDU_SECTION_HEADERS, ('experience', 'projects', 'skills', 'certifications'))
    stated = _stated_experience_years(text)
    work_ranges = _parse_date_ranges(work_text if work_text.strip() else text)
    edu_ranges = set(_parse_date_ranges(edu_text)) if edu_text.strip() else set()
    filtered = [r for r in work_ranges if r not in edu_ranges]
    # If we scanned the whole resume, drop ranges that clearly belong to education (typically 3-5 year spans inside edu section)
    if not work_text.strip():
        filtered = [r for r in filtered if r not in edu_ranges]
        # Prefer stated years over summing education-like year ranges
        calculated = _merge_range_years(filtered)
        if stated > 0:
            return stated
        return calculated
    calculated = _merge_range_years(filtered)
    return max(stated, calculated)


def parse_text(text):
    # Normalize common Markdown formatting from copied resume templates before
    # applying section and entity matchers.
    text = re.sub(r'[*_`#]+', '', text)
    text_lower = text.lower()
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    # Extract Email
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    email = email_match.group(0).strip() if email_match else ''

    # Extract Phone
    phone_match = re.search(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
    phone = phone_match.group(0).strip() if phone_match else ''

    # Extract Links
    github_match = re.search(r'(?:(?:https?:\/\/)?(?:www\.)?)github\.com\/[a-zA-Z0-9-]+', text, re.IGNORECASE)
    linkedin_match = re.search(r'(?:(?:https?:\/\/)?(?:www\.)?)linkedin\.com\/in\/[a-zA-Z0-9_.%-]+', text, re.IGNORECASE)

    def normalize_profile_url(match):
        value = match.group(0).rstrip('.,;:!?) ]}') if match else ''
        if not value:
            return ''
        return value if re.match(r'^https?://', value, re.IGNORECASE) else f'https://{value}'

    github = normalize_profile_url(github_match)
    linkedin = normalize_profile_url(linkedin_match)

    # Extract Name (using spaCy if available, otherwise fallback)
    fullName = ''
    labeled_name = re.search(r'^\s*(?:full\s+name|candidate\s+name|name)\s*[:\-]\s*(.+?)\s*$', text, re.IGNORECASE | re.MULTILINE)
    if labeled_name:
        fullName = labeled_name.group(1).strip(' \t:*-')
    if nlp:
        if not fullName:
            doc = nlp(text[:2000]) # Scan beginning of resume
            for ent in doc.ents:
                if ent.label_ == "PERSON" and len(ent.text.split()) >= 2:
                    fullName = ent.text.strip()
                    break
    
    if not fullName:
        # Fallback Name Extraction
        for line in lines[:5]:
            if not email in line and not phone in line and 'github' not in line.lower() and 'linkedin' not in line.lower() and len(line) < 50:
                # Remove common resume headers
                if not any(header in line.lower() for header in ['resume', 'cv', 'curriculum', 'profile', 'contact', 'summary']):
                    if re.match(r'^[a-zA-Z\s\.]+$', line):
                        fullName = line
                        break
        if not fullName:
            fullName = 'Unknown Candidate'

    # Extract Location
    location = ''
    if nlp:
        doc = nlp(text)
        gpes = [ent.text.strip() for ent in doc.ents if ent.label_ in ["GPE", "LOC"]]
        if gpes:
            location = gpes[0]
    
    if not location:
        # Fallback Location search
        addr_keywords = ['street', 'st.', 'road', 'rd.', 'avenue', 'ave.', 'lane', 'ln.', 'city', 'apartment', 'apt.']
        for line in lines:
            if any(keyword in line.lower() for keyword in addr_keywords) and len(line) < 100 and len(line) > 10:
                location = line
                break
        if not location:
            location = 'Not Disclosed'

    # Extract Skills
    technical = []
    soft = []
    for skill in TECHNICAL_SKILLS:
        pattern = rf'\b{re.escape(skill)}\b'
        if re.search(pattern, text_lower):
            technical.append(skill.capitalize())
    
    for skill in SOFT_SKILLS:
        pattern = rf'\b{re.escape(skill)}\b'
        if re.search(pattern, text_lower):
            soft.append(skill.capitalize())

    # Extract Languages
    languages = []
    for lang in LANGUAGES:
        pattern = rf'\b{re.escape(lang)}\b'
        if re.search(pattern, text_lower):
            languages.append(lang.capitalize())
    if not languages:
        languages = ['Not Disclosed']

    # Extract Education
    detectedDegree = ''
    for deg in DEGREES:
        if deg in text_lower:
            detectedDegree = deg.title()
            break
    
    detectedCollege = ''
    for line in lines:
        if any(keyword in line.lower() for keyword in COLLEGE_KEYWORDS) and len(line) < 100:
            detectedCollege = line
            break

    cgpa = 0.0
    cgpa_match = re.search(r'(?:cgpa|gpa|pointer)[:\s]+(\d+(?:\.\d+)?)(?:\/10)?', text, re.IGNORECASE)
    if cgpa_match:
        cgpa = float(cgpa_match.group(1))
    else:
        floats = re.findall(r'\b([5-9]\.\d{1,2}|10\.0)\b', text)
        if floats:
            cgpa = float(floats[0])

    education = [{
        'degree': detectedDegree or 'Not Disclosed',
        'college': detectedCollege or 'Not Disclosed',
        'cgpa': cgpa
    }]

    # Extract Experience Years from work history only (ignore education dates)
    experienceYears = extract_experience_years(text, lines)

    # Extract Projects & Certifications
    projects = []
    certifications = []

    cert_keywords = ['certified', 'certification', 'certificate', 'credential']
    for line in lines:
        if any(keyword in line.lower() for keyword in cert_keywords) and len(line) < 80 and len(line) > 5:
            cleaned = re.sub(r'^[^a-zA-Z0-9]+|[^a-zA-Z0-9\s()\-]+$', '', line).strip()
            if len(cleaned) > 10 and cleaned not in certifications:
                certifications.append(cleaned)

    for i, line in enumerate(lines):
        if 'project' in line.lower() and len(line) < 60:
            next_line = lines[i+1] if i+1 < len(lines) else ''
            if len(next_line) > 15 and len(next_line) < 200:
                projects.append({'name': line, 'desc': next_line})

    # DYNAMIC SKILL VALIDATION (Step 4)
    skill_validation = []
    for skill in technical:
        skill_lower = skill.lower()
        
        # 1. Project Evidence
        proj_evidence = []
        for p in projects:
            if skill_lower in p['name'].lower() or skill_lower in p['desc'].lower():
                proj_evidence.append(f"Project: {p['name']}")
        project_factor = min(1.0, len(proj_evidence) / 2.0)

        # 2. Experience Evidence
        has_exp_evidence = any(skill_lower in line.lower() for line in lines if any(k in line.lower() for k in ['work', 'experience', 'intern', 'job', 'developer', 'engineer']))
        experience_factor = 1.0 if (has_exp_evidence and experienceYears > 0) else 0.0

        # 3. Certification Evidence
        has_cert_evidence = any(skill_lower in c.lower() for c in certifications)
        certification_factor = 1.0 if has_cert_evidence else 0.0

        # 4. Frequency
        count = text_lower.count(skill_lower)
        frequency_factor = min(1.0, count / 5.0)

        # Calculate Confidence Weighting (0.4 * project + 0.25 * experience + 0.20 * certification + 0.15 * frequency)
        confidence = int((0.40 * project_factor + 0.25 * experience_factor + 0.20 * certification_factor + 0.15 * frequency_factor) * 100)
        confidence = max(10, min(99, confidence))
        status = 'Verified' if confidence >= 50 else 'Needs Validation'

        skill_validation.append({
            'skill': skill,
            'confidence': confidence,
            'evidence': proj_evidence if proj_evidence else ['Only listed in skills section'],
            'status': status
        })

    # DYNAMIC ATS SCORE CALCULATION (Step 5)
    # Formatting (10%), Skills (30%), Projects (20%), Experience (20%), Education (10%), Keywords (10%)
    formatting_score = 100 if (github and linkedin) else (75 if (github or linkedin) else 50)
    skills_score = min(100, len(technical) * 10 + 20)
    projects_score = min(100, len(projects) * 30 + 10)
    experience_score = min(100, int(experienceYears * 12 + 40))
    education_score = 100 if (detectedDegree and detectedCollege and cgpa > 0) else (75 if cgpa > 0 else 50)
    keywords_score = min(100, (len(technical) + len(soft)) * 5)

    ats_score = int(0.10 * formatting_score + 0.30 * skills_score + 0.20 * projects_score + 0.20 * experience_score + 0.10 * education_score + 0.10 * keywords_score)
    ats_score = max(30, min(98, ats_score))

    # Dynamic suggestions
    strengths = []
    weaknesses = []
    recommendations = []
    if len(technical) > 5:
        strengths.append("Comprehensive technical skill stack identified")
    if len(projects) > 1:
        strengths.append("Demonstrates hands-on project experience")
    if not github:
        weaknesses.append("No public GitHub portfolio link found")
        recommendations.append("Add a GitHub profile to showcase real codebases")
    if not linkedin:
        weaknesses.append("No professional LinkedIn url found")
        recommendations.append("Include a LinkedIn link to boost recruiter connection")
    if experienceYears == 0:
        weaknesses.append("Entry-level profile with low industry duration")
        recommendations.append("Flesh out projects using impact statistics")
    
    if not strengths: strengths.append("Clear single-column document structure")
    if not weaknesses: weaknesses.append("No major missing elements")
    if not recommendations: recommendations.append("Keep github projects active and documented")

    suggestions = {
        'strengths': strengths,
        'weaknesses': weaknesses,
        'recommendations': recommendations
    }

    return {
        'fullName': fullName,
        'email': email,
        'phone': phone,
        'skills': {'technical': technical, 'soft': soft},
        'education': education,
        'experienceYears': experienceYears,
        'projects': projects,
        'certifications': certifications,
        'github': github,
        'linkedin': linkedin,
        'location': location,
        'languages': languages,
        'skill_validation': skill_validation,
        'resume_suggestions': suggestions,
        'ats_score': ats_score
    }

def match_job(candidate_skills, job_skills, candidate_text=None, job_text=None):
    # Compute matched & missing
    cand_skills_lower = [s.lower().strip() for s in candidate_skills]
    matched = []
    missing = []
    for js in job_skills:
        js_lower = js.lower().strip()
        # Semantic check: word overlap or substring check
        is_matched = False
        for cs in cand_skills_lower:
            if cs in js_lower or js_lower in cs:
                is_matched = True
                break
        if is_matched:
            matched.append(js)
        else:
            missing.append(js)

    # Compute similarity (using SentenceTransformer model if loaded, otherwise fallback VSM)
    similarity = 0.0
    if model and candidate_text and job_text:
        try:
            emb1 = model.encode(candidate_text, convert_to_tensor=True)
            emb2 = model.encode(job_text, convert_to_tensor=True)
            similarity = float(util.cos_sim(emb1, emb2)[0][0])
        except Exception:
            similarity = 0.0

    if similarity <= 0.0:
        # Fallback pure python cosine TF-IDF similarity
        try:
            cand_body = candidate_text or " ".join(candidate_skills)
            job_body = job_text or " ".join(job_skills)
            words1 = Counter(re.findall(r'\w+', cand_body.lower()))
            words2 = Counter(re.findall(r'\w+', job_body.lower()))
            intersection = set(words1.keys()) & set(words2.keys())
            numerator = sum([words1[x] * words2[x] for x in intersection])
            sum1 = sum([words1[x]**2 for x in words1.keys()])
            sum2 = sum([words2[x]**2 for x in words2.keys()])
            denominator = math.sqrt(sum1) * math.sqrt(sum2)
            similarity = float(numerator) / denominator if denominator else 0.0
        except Exception:
            similarity = 0.0

    match_pct = int(similarity * 100)
    match_pct = max(10, min(98, match_pct))

    return {
        'matched': matched,
        'missing': missing,
        'similarity': match_pct,
        'gap': missing
    }

if __name__ == '__main__':
    # Communication via stdin/stdout json stream
    try:
        input_data = json.loads(sys.stdin.read())
        action = input_data.get('action')
        
        if action == 'parse':
            result = parse_text(input_data.get('text', ''))
            print(json.dumps(result))
        elif action == 'match':
            result = match_job(
                input_data.get('candidate_skills', []),
                input_data.get('job_skills', []),
                input_data.get('candidate_text', ''),
                input_data.get('job_text', '')
            )
            print(json.dumps(result))
        else:
            print(json.dumps({'error': 'Invalid action'}))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
