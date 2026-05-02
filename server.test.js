const request = require('supertest');

// Mock db module — tests use in-memory fallback
jest.mock('./db', () => ({
  getConversation: jest.fn().mockResolvedValue(null),
  saveConversation: jest.fn().mockResolvedValue(false),
  deleteConversation: jest.fn().mockResolvedValue(false),
  listConversationsByUser: jest.fn().mockResolvedValue([]),
  claimSessions: jest.fn().mockResolvedValue(0),
  initDatabase: jest.fn().mockResolvedValue(false),
  closePool: jest.fn().mockResolvedValue(undefined),
  setPool: jest.fn()
}));

// Mock @clerk/backend so tests don't need a real Clerk key
jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn()
}));

const db = require('./db');
const { verifyToken } = require('@clerk/backend');
const { app, conversations, setAnthropicClient, SYSTEM_PROMPT } = require('./server');

describe('PadTask Server', () => {
  // Mock Anthropic client
  const mockCreate = jest.fn();
  const mockAnthropicClient = {
    messages: {
      create: mockCreate
    }
  };

  beforeEach(() => {
    // Clear conversations before each test
    Object.keys(conversations).forEach(key => delete conversations[key]);
    // Reset mocks
    mockCreate.mockReset();
    db.getConversation.mockReset().mockResolvedValue(null);
    db.saveConversation.mockReset().mockResolvedValue(false);
    db.deleteConversation.mockReset().mockResolvedValue(false);
    db.listConversationsByUser.mockReset().mockResolvedValue([]);
    db.claimSessions.mockReset().mockResolvedValue(0);
    verifyToken.mockReset();
    // Default: no CLERK_SECRET_KEY — guest mode
    delete process.env.CLERK_SECRET_KEY;
    // Inject mock client
    setAnthropicClient(mockAnthropicClient);
  });

  describe('SYSTEM_PROMPT', () => {
    it('should be defined and contain task-related instructions', () => {
      expect(SYSTEM_PROMPT).toBeDefined();
      expect(SYSTEM_PROMPT).toContain('task organizer');
      expect(SYSTEM_PROMPT).toContain('## Section Name');
    });
  });

  describe('GET / (static files)', () => {
    it('should serve index.html', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/html/);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/chat', () => {
    it('should return 400 if sessionId is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('sessionId and message are required');
    });

    it('should return 400 if message is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'test-session' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('sessionId and message are required');
    });

    it('should return 400 if both sessionId and message are missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('sessionId and message are required');
    });

    it('should create a new conversation for new sessionId', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello! How can I help you?' }]
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'new-session', message: 'Hello' });

      expect(response.status).toBe(200);
      expect(conversations['new-session']).toBeDefined();
      expect(conversations['new-session'].length).toBe(2); // user + assistant
    });

    it('should return message from Claude API', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I can help you with tasks!' }]
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'test-session', message: 'Help me' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('I can help you with tasks!');
    });

    it('should extract todoMarkdown from response with tasks', async () => {
      const taskResponse = 'Here are your tasks!\n\n## Today\'s Tasks\n\n- [ ] Buy groceries\n- [ ] Call dentist\n\nLet me know if you need help!';
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: taskResponse }]
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'test-session', message: 'I need to buy groceries and call dentist' });

      expect(response.status).toBe(200);
      expect(response.body.todoMarkdown).toContain('## Today\'s Tasks');
      expect(response.body.todoMarkdown).toContain('- [ ] Buy groceries');
      // Message should have task markdown stripped
      expect(response.body.message).not.toContain('## Today\'s Tasks');
      expect(response.body.message).toContain('Here are your tasks!');
    });

    it('should return null todoMarkdown when no tasks in response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello! How can I help you today?' }]
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'test-session', message: 'Hello' });

      expect(response.status).toBe(200);
      expect(response.body.todoMarkdown).toBeNull();
    });

    it('should handle non-text content type', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'image', data: 'base64data' }]
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'test-session', message: 'Hello' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('');
    });

    it('should maintain conversation history', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'First response' }]
      });

      await request(app)
        .post('/api/chat')
        .send({ sessionId: 'history-session', message: 'First message' });

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Second response' }]
      });

      await request(app)
        .post('/api/chat')
        .send({ sessionId: 'history-session', message: 'Second message' });

      expect(conversations['history-session'].length).toBe(4);
      expect(conversations['history-session'][0].content).toBe('First message');
      expect(conversations['history-session'][1].content).toBe('First response');
      expect(conversations['history-session'][2].content).toBe('Second message');
      expect(conversations['history-session'][3].content).toBe('Second response');
    });

    it('should trim conversation history to last 20 messages', async () => {
      // Pre-populate with 20 messages
      conversations['trim-session'] = [];
      for (let i = 0; i < 20; i++) {
        conversations['trim-session'].push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`
        });
      }

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response after trim' }]
      });

      // Add user message = 21 total, triggers trim to 20, then assistant response = 21
      await request(app)
        .post('/api/chat')
        .send({ sessionId: 'trim-session', message: 'Message 20' });

      // After trim + assistant response = 21 messages
      expect(conversations['trim-session'].length).toBe(21);
      // First message should now be Message 1 (Message 0 was trimmed before API call)
      expect(conversations['trim-session'][0].content).toBe('Message 1');
      // Last message should be the assistant response
      expect(conversations['trim-session'][20].content).toBe('Response after trim');
    });

    it('should return 500 on API error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'error-session', message: 'Hello' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to get response from Claude');
      expect(consoleSpy).toHaveBeenCalledWith('Anthropic API Error:', 'API rate limit exceeded');

      consoleSpy.mockRestore();
    });

    it('should call Anthropic API with correct parameters', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      await request(app)
        .post('/api/chat')
        .send({ sessionId: 'params-session', message: 'Test message' });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
      expect(callArgs.max_tokens).toBe(1024);
      expect(callArgs.system).toBe(SYSTEM_PROMPT);
      // Messages at time of call included only the user message
      expect(callArgs.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Test message' })
        ])
      );
    });

    it('should strip task markdown from assistant message stored in history', async () => {
      // Regression test: previously stored full assistant response (including
      // stale task snapshots) caused checked items to revert on the next turn.
      const taskResponse = 'Updated!\n\n## Tasks\n\n- [x] Done item\n- [ ] Other\n\nAll set.';
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: taskResponse }]
      });

      await request(app)
        .post('/api/chat')
        .send({ sessionId: 'strip-session', message: 'mark as done' });

      const stored = conversations['strip-session'][1];
      expect(stored.role).toBe('assistant');
      expect(stored.content).not.toContain('## Tasks');
      expect(stored.content).not.toContain('- [x]');
      expect(stored.content).not.toContain('- [ ]');
      expect(stored.content).toContain('Updated!');
      expect(stored.content).toContain('All set.');
    });

    it('should load conversation history from database when available', async () => {
      // Simulate DB returning existing guest history (userId = null)
      db.getConversation.mockResolvedValue({
        messages: [
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' }
        ],
        userId: null
      });

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Follow-up response' }]
      });

      await request(app)
        .post('/api/chat')
        .send({ sessionId: 'db-session', message: 'Follow-up question' });

      // Verify DB history was loaded and appended to
      expect(conversations['db-session'].length).toBe(4);
      expect(conversations['db-session'][0].content).toBe('Previous question');
      expect(conversations['db-session'][1].content).toBe('Previous answer');
      expect(conversations['db-session'][2].content).toBe('Follow-up question');
      expect(conversations['db-session'][3].content).toBe('Follow-up response');
      // Verify DB save was attempted as guest (null userId)
      expect(db.saveConversation).toHaveBeenCalledWith('db-session', expect.any(Array), null);
    });

    it('should associate conversation with Clerk userId when token is valid', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockResolvedValue({ sub: 'user_abc123' });

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello user!' }]
      });

      await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer valid.jwt.token')
        .send({ sessionId: 'authed-session', message: 'Hi' });

      expect(verifyToken).toHaveBeenCalledWith('valid.jwt.token', { secretKey: 'sk_test_dummy' });
      expect(db.saveConversation).toHaveBeenCalledWith('authed-session', expect.any(Array), 'user_abc123');
    });

    it('should treat invalid Clerk tokens as guest sessions', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockRejectedValue(new Error('invalid token'));

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello guest!' }]
      });

      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer bad.jwt.token')
        .send({ sessionId: 'bad-token-session', message: 'Hi' });

      expect(response.status).toBe(200);
      expect(db.saveConversation).toHaveBeenCalledWith('bad-token-session', expect.any(Array), null);
    });

    it('should skip token verification when CLERK_SECRET_KEY is not set', async () => {
      // No CLERK_SECRET_KEY (deleted in beforeEach)
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer some.token')
        .send({ sessionId: 'no-key-session', message: 'Hi' });

      expect(verifyToken).not.toHaveBeenCalled();
      expect(db.saveConversation).toHaveBeenCalledWith('no-key-session', expect.any(Array), null);
    });

    it('should treat missing authorization header as guest when key is set', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      await request(app)
        .post('/api/chat')
        .send({ sessionId: 'no-auth-session', message: 'Hi' });

      expect(verifyToken).not.toHaveBeenCalled();
      expect(db.saveConversation).toHaveBeenCalledWith('no-auth-session', expect.any(Array), null);
    });

    it('should handle Clerk payload without sub claim as guest', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockResolvedValue({}); // payload with no sub

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer tokenish')
        .send({ sessionId: 'no-sub-session', message: 'Hi' });

      expect(db.saveConversation).toHaveBeenCalledWith('no-sub-session', expect.any(Array), null);
    });

    it('should ignore non-Bearer authorization headers', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      await request(app)
        .post('/api/chat')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .send({ sessionId: 'basic-auth-session', message: 'Hi' });

      expect(verifyToken).not.toHaveBeenCalled();
      expect(db.saveConversation).toHaveBeenCalledWith('basic-auth-session', expect.any(Array), null);
    });

    it('should swallow database save errors without failing the request', async () => {
      db.saveConversation.mockRejectedValue(new Error('DB write failed'));
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'db-error-session', message: 'Hello' });

      // Request still succeeds even though DB write failed
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Response');
      // Give the .catch() handler a tick to run
      await new Promise(resolve => setImmediate(resolve));
    });

    it('should include currentTasks in system prompt when provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Updated tasks!' }]
      });

      const currentTasks = '## My Tasks\n\n- [ ] Existing task';
      await request(app)
        .post('/api/chat')
        .send({ sessionId: 'tasks-session', message: 'Add another task', currentTasks });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('CURRENT TASK LIST');
      expect(callArgs.system).toContain(currentTasks);
    });
  });

  describe('POST /api/clear', () => {
    it('should clear conversation for given sessionId', async () => {
      // Create a conversation first
      conversations['clear-session'] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const response = await request(app)
        .post('/api/clear')
        .send({ sessionId: 'clear-session' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(conversations['clear-session']).toBeUndefined();
    });

    it('should return success even if sessionId does not exist', async () => {
      const response = await request(app)
        .post('/api/clear')
        .send({ sessionId: 'nonexistent-session' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return success if sessionId is not provided', async () => {
      const response = await request(app)
        .post('/api/clear')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should swallow database delete errors', async () => {
      db.deleteConversation.mockRejectedValue(new Error('DB delete failed'));

      const response = await request(app)
        .post('/api/clear')
        .send({ sessionId: 'db-error-clear' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(db.deleteConversation).toHaveBeenCalledWith('db-error-clear');
    });

    it('should refuse to clear a conversation owned by another user', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockResolvedValue({ sub: 'user_b' });
      db.getConversation.mockResolvedValue({
        messages: [{ role: 'user', content: 'Hi' }],
        userId: 'user_a'
      });

      const response = await request(app)
        .post('/api/clear')
        .set('Authorization', 'Bearer tok')
        .send({ sessionId: 'owned-by-a' });

      expect(response.status).toBe(403);
      expect(db.deleteConversation).not.toHaveBeenCalled();
    });
  });

  describe('Ownership enforcement on /api/chat', () => {
    it('should reject guest requests to an owned conversation', async () => {
      db.getConversation.mockResolvedValue({
        messages: [{ role: 'user', content: 'private' }],
        userId: 'user_a'
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'owned-session', message: 'Hi' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should reject requests from a different authenticated user', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockResolvedValue({ sub: 'user_b' });
      db.getConversation.mockResolvedValue({
        messages: [{ role: 'user', content: 'private' }],
        userId: 'user_a'
      });

      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer tok')
        .send({ sessionId: 'user-a-session', message: 'Hi' });

      expect(response.status).toBe(403);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should allow the owner to access their conversation', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockResolvedValue({ sub: 'user_a' });
      db.getConversation.mockResolvedValue({
        messages: [{ role: 'user', content: 'earlier' }],
        userId: 'user_a'
      });
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Welcome back!' }]
      });

      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer tok')
        .send({ sessionId: 'user-a-session', message: 'Hi again' });

      expect(response.status).toBe(200);
      expect(db.saveConversation).toHaveBeenCalledWith('user-a-session', expect.any(Array), 'user_a');
    });
  });

  describe('GET /api/conversations', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/conversations');
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('authentication required');
    });

    it('should return the authenticated user\'s conversations', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockResolvedValue({ sub: 'user_a' });
      db.listConversationsByUser.mockResolvedValue([
        { sessionId: 's1', messages: [{ role: 'user', content: 'hi' }], updatedAt: '2024-01-01' }
      ]);

      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', 'Bearer tok');

      expect(response.status).toBe(200);
      expect(db.listConversationsByUser).toHaveBeenCalledWith('user_a');
      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0].sessionId).toBe('s1');
    });
  });

  describe('POST /api/claim-sessions', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .post('/api/claim-sessions')
        .send({ sessionIds: ['s1'] });
      expect(response.status).toBe(401);
    });

    it('should return 400 when sessionIds is not an array', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockResolvedValue({ sub: 'user_a' });

      const response = await request(app)
        .post('/api/claim-sessions')
        .set('Authorization', 'Bearer tok')
        .send({ sessionIds: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(db.claimSessions).not.toHaveBeenCalled();
    });

    it('should claim guest sessions for the authenticated user', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
      verifyToken.mockResolvedValue({ sub: 'user_a' });
      db.claimSessions.mockResolvedValue(2);

      const response = await request(app)
        .post('/api/claim-sessions')
        .set('Authorization', 'Bearer tok')
        .send({ sessionIds: ['s1', 's2', 's3'] });

      expect(response.status).toBe(200);
      expect(response.body.claimed).toBe(2);
      expect(db.claimSessions).toHaveBeenCalledWith(['s1', 's2', 's3'], 'user_a');
    });
  });
});
