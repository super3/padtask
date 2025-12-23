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

When a user describes tasks they need to do, extract them and respond with:
1. A brief, friendly acknowledgment
2. The tasks formatted as a markdown list with checkboxes

Format your task lists like this:
## Today's Tasks

- [ ] Task one
- [ ] Task two
- [ ] Task three

Keep responses concise and friendly. If the user asks to clear tasks or start over, acknowledge it.
If the user marks something as done or completed, congratulate them briefly.
If the user's message isn't about tasks, respond helpfully but try to steer back to task management.`;

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

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

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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

    // Extract todo markdown from response
    let todoMarkdown = '';
    const todoMatch = assistantMessage.match(/## .+\n\n([\s\S]*?)(?=\n\n[^-]|$)/);
    if (todoMatch) {
      todoMarkdown = todoMatch[0];
    }

    res.json({
      message: assistantMessage,
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
  app.listen(PORT, () => {
    console.log(`PadTask server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, conversations, setAnthropicClient, SYSTEM_PROMPT };
