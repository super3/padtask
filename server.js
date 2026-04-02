const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk').default;
const path = require('path');
require('dotenv').config();

const app = express();

// Create Anthropic client (can be overridden for testing)
let anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Allow tests to inject a mock client
const setAnthropicClient = (client) => {
  anthropic = client;
};

// Security headers via helmet
app.use(helmet());

// CORS: restrict to allowed origins (comma-separated in env), default to same-origin only
const getAllowedOrigins = () => {
  return process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, server-to-server, curl)
    if (!origin) return callback(null, true);
    if (getAllowedOrigins().includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json());

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', apiLimiter);

// Auth middleware: require API_SECRET_KEY as Bearer token when configured
const requireAuth = (req, res, next) => {
  const apiSecretKey = process.env.API_SECRET_KEY;
  if (!apiSecretKey) return next(); // skip auth if not configured

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  if (token !== apiSecretKey) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  next();
};

// Serve static files (index.html)
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Store conversation history per session (in production, use a database)
const conversations = {};

const SYSTEM_PROMPT = `You are a helpful task organizer assistant for PadTask. Your job is to help users organize their tasks and todos.

IMPORTANT: When a user provides tasks or asks you to add/modify tasks, you MUST output the complete updated task list in markdown format. This is how tasks get saved to the system.

When responding with tasks, ALWAYS format them like this:
## Section Name

- [ ] Task one
- [ ] Task two
- [x] Completed task

Rules:
1. ALWAYS output the full task list in markdown format when tasks are added, modified, or discussed
2. If the user provides tasks directly (even in their message), output them as markdown checkboxes
3. Preserve existing tasks and add new ones - maintain the complete list
4. Use "- [ ]" for incomplete tasks and "- [x]" for completed tasks
5. Group tasks under section headings (## Section Name) when appropriate
6. After the task markdown, you may add a brief friendly comment

If the user asks to clear tasks or start over, acknowledge it (don't output any task markdown).
If the user's message isn't about tasks, respond helpfully.`;

app.post('/api/chat', requireAuth, async (req, res) => {
  const { sessionId, message, currentTasks } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }

  // Initialize session if needed
  if (!conversations[sessionId]) {
    conversations[sessionId] = [];
  }

  // Add user message to history
  conversations[sessionId].push({
    role: 'user',
    content: message
  });

  // Keep conversation history manageable (last 20 messages)
  if (conversations[sessionId].length > 20) {
    conversations[sessionId] = conversations[sessionId].slice(-20);
  }

  // Extract task sections from a markdown string
  const extractTaskSections = (text) => {
    const regex = /## .+\n\n?(?:- \[[ x]\] .+\n?)+/gi;
    const sections = [];
    let m;
    while ((m = regex.exec(text)) !== null) {
      sections.push(m[0]);
    }
    return sections;
  };

  // Strip task sections from a markdown string
  const stripTaskSections = (text, sections) => {
    let stripped = text;
    sections.forEach(section => {
      stripped = stripped.replace(section, '');
    });
    return stripped.trim();
  };

  // Build system prompt with current tasks context
  let systemPrompt = SYSTEM_PROMPT;
  if (currentTasks && currentTasks.trim()) {
    systemPrompt += `\n\nCURRENT TASK LIST (include and update this when outputting tasks):\n${currentTasks}`;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversations[sessionId]
    });

    const assistantMessage = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Extract todo markdown from response (all sections with checkboxes)
    let todoMarkdown = '';
    let chatMessage = assistantMessage;

    const sections = extractTaskSections(assistantMessage);

    if (sections.length > 0) {
      todoMarkdown = sections.join('\n');
      // Strip all task sections from chat message
      chatMessage = stripTaskSections(assistantMessage, sections);
    }

    // Store assistant message in history WITHOUT task markdown. The authoritative
    // task state is passed fresh via the system prompt's CURRENT TASK LIST on each
    // request, so keeping stale task snapshots in history causes the model to
    // revert user-side edits (like unchecking items the user had just checked).
    conversations[sessionId].push({
      role: 'assistant',
      content: chatMessage || assistantMessage
    });

    res.json({
      message: chatMessage,
      todoMarkdown: todoMarkdown || null,
      model: response.model
    });

  } catch (error) {
    console.error('Anthropic API Error:', error.message);
    res.status(500).json({ error: 'Failed to get response from Claude' });
  }
});

// Clear conversation endpoint
app.post('/api/clear', requireAuth, (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && conversations[sessionId]) {
    delete conversations[sessionId];
  }
  res.json({ success: true });
});

// Only start server if run directly (not imported for testing)
/* istanbul ignore next */
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    console.log(`PadTask server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown handling
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, conversations, setAnthropicClient, SYSTEM_PROMPT, apiLimiter };
