const express = require('express');
const cors = require('cors');
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

app.use(cors());
app.use(express.json());

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

app.post('/api/chat', async (req, res) => {
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

    // Add assistant message to history
    conversations[sessionId].push({
      role: 'assistant',
      content: assistantMessage
    });

    // Extract todo markdown from response (all sections with checkboxes)
    let todoMarkdown = '';
    let chatMessage = assistantMessage;

    // Match all sections that contain checkbox items (1-2 newlines after heading)
    const sections = [];
    const sectionRegex = /## .+\n\n?(?:- \[[ x]\] .+\n?)+/gi;
    let match;
    while ((match = sectionRegex.exec(assistantMessage)) !== null) {
      sections.push(match[0]);
    }

    if (sections.length > 0) {
      todoMarkdown = sections.join('\n');
      // Strip all task sections from chat message
      chatMessage = assistantMessage;
      sections.forEach(section => {
        chatMessage = chatMessage.replace(section, '');
      });
      chatMessage = chatMessage.trim();
    }

    res.json({
      message: chatMessage,
      todoMarkdown: todoMarkdown || null
    });

  } catch (error) {
    console.error('Anthropic API Error:', error.message);
    res.status(500).json({ error: 'Failed to get response from Claude' });
  }
});

// Clear conversation endpoint
app.post('/api/clear', (req, res) => {
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

module.exports = { app, conversations, setAnthropicClient, SYSTEM_PROMPT };
