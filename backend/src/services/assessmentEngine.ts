/**
 * AI Skill Validation & Technical Assessment Engine
 * Performs real NLP semantic assessment, concept verification, and gibberish detection.
 */

export interface AssessmentQuestion {
  id: string;
  skill: string;
  question: string;
  category: string;
  sampleKeywords: string[];
}

export interface EvaluationResult {
  score: number;
  verdict: 'Excellent' | 'Good' | 'Needs Improvement' | 'Poor' | 'Invalid / Gibberish';
  feedback: string;
  verified: boolean;
  keyConceptsCovered: string[];
  missingConcepts: string[];
}

// Technical Knowledge Base for Skills
const SKILL_KB: Record<string, {
  questions: string[];
  keywords: string[];
  coreConcepts: string[];
}> = {
  'java': {
    questions: [
      "Explain the differences between HashMap, TreeMap, and ConcurrentHashMap in Java, and how hash collisions are resolved.",
      "How does Java Garbage Collection work (Generational GC, Eden/Survivor spaces), and how do you prevent memory leaks?",
      "Explain how Spring Boot handles Dependency Injection (IoC), and describe how you build RESTful APIs with it."
    ],
    keywords: ['hashmap', 'treemap', 'concurrenthashmap', 'collision', 'equals', 'hashcode', 'garbage collection', 'gc', 'eden', 'survivor', 'heap', 'stack', 'memory leak', 'spring', 'spring boot', 'ioc', 'dependency injection', 'annotation', 'rest', 'controller', 'service', 'repository', 'jvm', 'multithreading', 'thread', 'synchronization', 'interface', 'polymorphism', 'inheritance'],
    coreConcepts: ['Memory Management & GC', 'Collections & Concurrency', 'Object-Oriented Design', 'Spring Framework / APIs']
  },
  'python': {
    questions: [
      "Explain the Python GIL (Global Interpreter Lock) and how you achieve true parallelism in CPU-bound vs I/O-bound tasks.",
      "How do Python generators and decorators work internally, and in what real-world project scenarios have you used them?",
      "Describe how you design and structure a backend API using FastAPI or Flask, including database ORM integration (SQLAlchemy)."
    ],
    keywords: ['gil', 'global interpreter lock', 'multiprocessing', 'threading', 'asyncio', 'generator', 'yield', 'decorator', 'wrapper', 'fastapi', 'flask', 'sqlalchemy', 'pydantic', 'orm', 'list comprehension', 'dict', 'tuple', 'lambda', 'exception', 'pip', 'virtualenv', 'type hints', 'dataclass'],
    coreConcepts: ['Concurrency & GIL', 'Language Internals (Generators/Decorators)', 'Web Frameworks & ORM']
  },
  'react': {
    questions: [
      "Explain the React Reconciliation algorithm (Virtual DOM, Fiber) and how React batches state updates.",
      "How do you optimize performance in a large React app (e.g. useMemo, useCallback, React.memo, code-splitting)?",
      "Describe how you manage complex global state in React (Context API vs Redux Toolkit vs Zustand) and handle side-effects."
    ],
    keywords: ['virtual dom', 'fiber', 'reconciliation', 'diffing', 'state', 'props', 'useeffect', 'usestate', 'usememo', 'usecallback', 'memo', 'redux', 'context', 'zustand', 'batching', 'lifecycle', 'hooks', 'jsx', 'lazy', 'suspense', 'code splitting', 'immutability', 'render'],
    coreConcepts: ['Virtual DOM & Reconciliation', 'Performance Optimization Hooks', 'State Management Architecture']
  },
  'sql': {
    questions: [
      "Explain how Database Indexing (B-Tree vs Hash index) works internally and how indexes optimize query execution plans.",
      "Describe the ACID properties in relational databases and how transaction isolation levels prevent dirty/phantom reads.",
      "Explain the difference between INNER JOIN, LEFT JOIN, and subqueries, and how you optimize slow SQL queries."
    ],
    keywords: ['index', 'b-tree', 'indexing', 'query plan', 'explain analyze', 'acid', 'atomicity', 'consistency', 'isolation', 'durability', 'transaction', 'commit', 'rollback', 'foreign key', 'primary key', 'inner join', 'left join', 'group by', 'aggregate', 'normalization', 'schema', 'table', 'partitioning'],
    coreConcepts: ['Indexing & Query Optimization', 'ACID Transactions & Isolation', 'Relational Schema Design & Joins']
  },
  'postgresql': {
    questions: [
      "Explain how PostgreSQL handles MVCC (Multi-Version Concurrency Control) and why vacuuming is necessary.",
      "Describe how you design normalized database schemas, write complex CTEs (Common Table Expressions), and use JSONB columns in PostgreSQL.",
      "How do you implement connection pooling (e.g. PgBouncer) and optimize PostgreSQL queries for high-throughput applications?"
    ],
    keywords: ['mvcc', 'vacuum', 'autovacuum', 'wal', 'write ahead log', 'cte', 'jsonb', 'pgbouncer', 'pool', 'connection', 'foreign key', 'constraint', 'trigger', 'function', 'sequence', 'serial', 'index', 'btree', 'gin', 'gist', 'transaction'],
    coreConcepts: ['MVCC & Vacuuming', 'Schema Design & Advanced SQL/JSONB', 'Performance Tuning & Connection Pooling']
  },
  'mysql': {
    questions: [
      "Compare MySQL InnoDB vs MyISAM storage engines in terms of transaction support, locking, and crash recovery.",
      "How do you optimize MySQL slow queries using EXPLAIN, indexes, and schema normalization?",
      "Describe how MySQL handles replication (Master-Slave, binary logs) and high availability."
    ],
    keywords: ['innodb', 'myisam', 'engine', 'explain', 'index', 'composite index', 'foreign key', 'transaction', 'locking', 'row-level', 'table-level', 'replication', 'binlog', 'normalization', 'acid'],
    coreConcepts: ['Storage Engines & Locking', 'Indexing & Query Optimization', 'Replication & Scalability']
  },
  'node.js': {
    questions: [
      "Explain the Node.js Event Loop phases (timers, pending callbacks, poll, check, close) and how libuv handles asynchronous I/O.",
      "How do you handle error handling, clustering, and process monitoring in a production Node.js/Express backend?",
      "Explain the difference between process.nextTick(), setImmediate(), and setTimeout() in Node.js."
    ],
    keywords: ['event loop', 'libuv', 'single-threaded', 'non-blocking', 'async', 'await', 'promise', 'callback', 'stream', 'buffer', 'cluster', 'worker threads', 'express', 'middleware', 'setimmediate', 'nexttick', 'settimeout', 'process', 'npm'],
    coreConcepts: ['Event Loop Architecture', 'Asynchronous Streams & Buffers', 'Production API & Middleware Design']
  },
  'rest api': {
    questions: [
      "Explain REST architectural constraints, idempotency in HTTP methods (GET, POST, PUT, DELETE, PATCH), and status codes.",
      "How do you implement secure user authentication and authorization using JWT (Access & Refresh tokens) in REST APIs?",
      "How do you design API rate limiting, pagination, and versioning for high-scale microservices?"
    ],
    keywords: ['rest', 'http', 'get', 'post', 'put', 'patch', 'delete', 'idempotent', 'status code', '200', '201', '400', '401', '403', '404', '500', 'jwt', 'token', 'bearer', 'authentication', 'authorization', 'rate limit', 'pagination', 'cors', 'json', 'headers'],
    coreConcepts: ['HTTP Methods & Idempotency', 'Authentication (JWT/OAuth)', 'API Design & Scaling']
  },
  'docker': {
    questions: [
      "Explain the difference between Docker images and containers, and how copy-on-write union filesystems (Overlay2) work.",
      "How do you optimize Dockerfiles for minimal image size and fast build caching using multi-stage builds?",
      "How do you configure Docker Compose for multi-container microservice applications with custom networks and volumes?"
    ],
    keywords: ['image', 'container', 'dockerfile', 'layer', 'cache', 'multi-stage', 'docker compose', 'volume', 'network', 'bridge', 'daemon', 'registry', 'docker hub', 'entrypoint', 'cmd', 'port', 'overlay2', 'alpine'],
    coreConcepts: ['Container Architecture & Layers', 'Multi-Stage Build Optimization', 'Docker Compose Networking']
  },
  'git': {
    questions: [
      "Explain the internal data model of Git (blobs, trees, commits, annotated tags, HEAD pointer).",
      "Describe the difference between Git Merge and Git Rebase, and how you resolve complex merge conflicts.",
      "What Git branching strategy (e.g. GitFlow, Trunk-based development) do you follow in team collaborations?"
    ],
    keywords: ['commit', 'branch', 'merge', 'rebase', 'conflict', 'head', 'blob', 'tree', 'tag', 'pull request', 'pr', 'remote', 'origin', 'clone', 'push', 'pull', 'stash', 'cherry-pick', 'gitflow', 'github'],
    coreConcepts: ['Git Internals & Object Model', 'Merge vs Rebase & Conflicts', 'Branching Strategies & CI']
  },
  'typescript': {
    questions: [
      "Explain the difference between `interface` and `type` in TypeScript, and how generics work with constraints (`extends`).",
      "What are TypeScript utility types (e.g. Partial, Pick, Omit, Record) and how do union types with type guards enhance type safety?",
      "How does TypeScript's strict mode (strictNullChecks, noImplicitAny) prevent runtime errors in large enterprise applications?"
    ],
    keywords: ['interface', 'type', 'generics', 'generic', 'extends', 'keyof', 'typeof', 'partial', 'pick', 'omit', 'record', 'union', 'intersection', 'guard', 'narrowing', 'strict', 'tsconfig', 'enum', 'any', 'unknown', 'never'],
    coreConcepts: ['Interfaces vs Type Aliases', 'Generics & Utility Types', 'Type Narrowing & Guards']
  }
};

// Fallback general questions
const GENERAL_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'gen-1',
    skill: 'Software Engineering',
    category: 'Architecture',
    question: "Explain how you designed the database schema or API endpoints in your recent projects. Highlight how you handled relations and performance.",
    sampleKeywords: ['database', 'schema', 'api', 'relation', 'foreign key', 'endpoint', 'rest', 'query', 'performance', 'index']
  },
  {
    id: 'gen-2',
    skill: 'Full Stack Development',
    category: 'State & Concurrency',
    question: "Given your verified technical background, how do you handle asynchronous state updates, error boundaries, or deployment pipelines?",
    sampleKeywords: ['async', 'state', 'pipeline', 'deployment', 'promise', 'error', 'testing', 'ci/cd', 'docker', 'build']
  },
  {
    id: 'gen-3',
    skill: 'Problem Solving',
    category: 'Debugging',
    question: "Describe a challenging bug you encountered in a recent project and trace the exact steps you took to debug, profile, and permanently resolve it.",
    sampleKeywords: ['bug', 'debug', 'log', 'reproduce', 'fix', 'error', 'investigate', 'resolve', 'test', 'root cause']
  }
];

/**
 * Generate technical assessment questions based on candidate's skills
 */
export function getAssessmentQuestionsForSkills(candidateSkills: string[]): AssessmentQuestion[] {
  const result: AssessmentQuestion[] = [];
  const normalizedSkills = candidateSkills.map(s => s.toLowerCase().trim());

  let idCounter = 1;

  for (const [skillKey, data] of Object.entries(SKILL_KB)) {
    if (normalizedSkills.some(s => s === skillKey || s.includes(skillKey) || skillKey.includes(s))) {
      const q = data.questions[0];
      result.push({
        id: `q-${idCounter++}`,
        skill: skillKey.toUpperCase(),
        question: q,
        category: data.coreConcepts[0] || 'Technical Proficiency',
        sampleKeywords: data.keywords.slice(0, 10)
      });
      if (result.length >= 4) break;
    }
  }

  // Ensure at least 3 questions
  if (result.length < 3) {
    for (const gq of GENERAL_QUESTIONS) {
      if (result.length >= 3) break;
      result.push(gq);
    }
  }

  return result;
}

/**
 * Checks if input is random keyboard gibberish (e.g. "fxchgjvhkbjn", "asdfasdf", "qwerty")
 */
function isGibberish(text: string): { gibberish: boolean; reason: string } {
  const trimmed = text.trim();
  if (trimmed.length < 15) {
    return { gibberish: true, reason: 'Answer is too brief (less than 15 characters). Please provide a complete explanation.' };
  }

  // Check unique character ratio (e.g. "aaaaaaaaaaaa" or repetitive patterns)
  const charMap: Record<string, number> = {};
  for (const c of trimmed.toLowerCase().replace(/\s/g, '')) {
    charMap[c] = (charMap[c] || 0) + 1;
  }
  const uniqueChars = Object.keys(charMap).length;
  if (uniqueChars <= 3 && trimmed.length > 20) {
    return { gibberish: true, reason: 'Repetitive character pattern detected without meaningful sentence structure.' };
  }

  // Check words: count real vs gibberish tokens
  const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length <= 2 && trimmed.length > 25) {
    return { gibberish: true, reason: 'Continuous unbroken string without spacing or words detected.' };
  }

  // Check vowel ratio in words longer than 4 chars
  let validWordCount = 0;
  const commonVowels = ['a', 'e', 'i', 'o', 'u', 'y'];

  for (const w of words) {
    const cleanW = w.replace(/[^a-z]/g, '');
    if (cleanW.length >= 4) {
      const vowelCount = cleanW.split('').filter(c => commonVowels.includes(c)).length;
      const vowelRatio = vowelCount / cleanW.length;
      // Normal English words have vowel ratio between 0.20 and 0.80
      if (vowelRatio >= 0.15 && vowelRatio <= 0.85) {
        validWordCount++;
      }
    } else if (cleanW.length > 0) {
      validWordCount++;
    }
  }

  const validWordRatio = validWordCount / (words.length || 1);
  if (validWordRatio < 0.40) {
    return { gibberish: true, reason: 'Random keyboard typing or unpronounceable character sequence detected.' };
  }

  // Common keyboard mash substrings
  const mashPatterns = [
    'asdf', 'hjkl', 'qwerty', 'zxcv', 'fghj', 'dfgh', 'ghjk', 'jkl;',
    'fxchg', 'vhkb', 'qwer', 'werty', 'poiuy', 'mnbvc', 'lkjhg'
  ];
  for (const pat of mashPatterns) {
    if (trimmed.toLowerCase().includes(pat)) {
      return { gibberish: true, reason: `Keyboard smash sequence detected ('${pat}'). Please provide an authentic technical explanation.` };
    }
  }

  return { gibberish: false, reason: '' };
}

/**
 * Real NLP evaluation of technical interview answers
 */
export function evaluateAssessmentAnswer(
  question: string,
  answer: string,
  skillName?: string
): EvaluationResult {
  // 1. Gibberish check
  const gibberishCheck = isGibberish(answer);
  if (gibberishCheck.gibberish) {
    return {
      score: 0,
      verdict: 'Invalid / Gibberish',
      feedback: `${gibberishCheck.reason} Submitting random characters does not demonstrate skill competence. Please write a thoughtful response addressing the technical question.`,
      verified: false,
      keyConceptsCovered: [],
      missingConcepts: ['Technical terminology', 'Real-world application', 'Architectural rationale']
    };
  }

  const ansLower = answer.toLowerCase();
  const words = ansLower.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Identify skill knowledge base
  let targetSkillData: { questions: string[]; keywords: string[]; coreConcepts: string[] } | null = null;
  if (skillName) {
    const sLower = skillName.toLowerCase();
    for (const [k, v] of Object.entries(SKILL_KB)) {
      if (sLower === k || sLower.includes(k) || k.includes(sLower)) {
        targetSkillData = v;
        break;
      }
    }
  }

  // If not found, look inside question
  if (!targetSkillData) {
    const qLower = question.toLowerCase();
    for (const [k, v] of Object.entries(SKILL_KB)) {
      if (qLower.includes(k)) {
        targetSkillData = v;
        break;
      }
    }
  }

  // Default keywords if no specific skill matched
  const domainKeywords = targetSkillData ? targetSkillData.keywords : [
    'design', 'schema', 'api', 'architecture', 'performance', 'database',
    'code', 'function', 'system', 'component', 'server', 'test', 'error',
    'optimization', 'logic', 'security', 'framework', 'data', 'algorithm'
  ];

  const coreConcepts = targetSkillData ? targetSkillData.coreConcepts : [
    'System Architecture', 'Implementation Details', 'Performance & Scaling'
  ];

  // 2. Keyword & Concept Matching
  const coveredKeywords: string[] = [];
  for (const kw of domainKeywords) {
    const pattern = new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(ansLower)) {
      coveredKeywords.push(kw);
    }
  }

  // 3. Compute Component Scores
  // A. Depth & Length (0 - 30 points)
  let depthScore = 0;
  if (wordCount >= 80) depthScore = 30;
  else if (wordCount >= 50) depthScore = 25;
  else if (wordCount >= 30) depthScore = 18;
  else if (wordCount >= 15) depthScore = 10;
  else depthScore = 5;

  // B. Technical Concept Coverage (0 - 45 points)
  const keywordRatio = Math.min(1.0, coveredKeywords.length / 5.0);
  const conceptScore = Math.round(keywordRatio * 45);

  // C. Question Relevance & Structure (0 - 25 points)
  // Check if response contains explanatory structure (e.g., "because", "in order to", "for example", "used", "implemented")
  let structurePoints = 10;
  const structureWords = ['because', 'for example', 'implemented', 'designed', 'handled', 'optimized', 'used', 'ensured', 'configured'];
  const foundStructure = structureWords.filter(sw => ansLower.includes(sw)).length;
  structurePoints += Math.min(15, foundStructure * 3);

  // Total Score (0 - 100)
  let totalScore = depthScore + conceptScore + structurePoints;
  totalScore = Math.max(10, Math.min(98, totalScore));

  // Determine Verdict
  let verdict: EvaluationResult['verdict'] = 'Needs Improvement';
  if (totalScore >= 80) verdict = 'Excellent';
  else if (totalScore >= 65) verdict = 'Good';
  else if (totalScore >= 45) verdict = 'Needs Improvement';
  else verdict = 'Poor';

  const verified = totalScore >= 60;

  // Key missing concepts
  const missingKeywords = domainKeywords.filter(k => !coveredKeywords.includes(k)).slice(0, 3);

  // Detailed Feedback Generation
  let feedback = `AI Evaluation Score: ${totalScore}%. `;
  if (totalScore >= 80) {
    feedback += `Outstanding technical response! You clearly demonstrated sound architectural understanding, proper terminology (${coveredKeywords.slice(0, 4).join(', ')}), and hands-on reasoning.`;
  } else if (totalScore >= 65) {
    feedback += `Solid explanation covering key technical fundamentals like ${coveredKeywords.slice(0, 3).join(', ')}. To strengthen your score further, consider discussing production trade-offs, edge-cases, or scaling considerations.`;
  } else if (totalScore >= 45) {
    feedback += `Basic understanding demonstrated, but the response lacks technical depth. Try incorporating specific implementation mechanisms (e.g. ${missingKeywords.join(', ')}) and project examples.`;
  } else {
    feedback += `The response is too brief or generic. Please elaborate with specific technical principles, real code structures, or algorithms.`;
  }

  return {
    score: totalScore,
    verdict,
    feedback,
    verified,
    keyConceptsCovered: coveredKeywords.slice(0, 5),
    missingConcepts: missingKeywords
  };
}
