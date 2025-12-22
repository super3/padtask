const request = require('supertest');
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
    // Reset mock
    mockCreate.mockReset();
    // Inject mock client
    setAnthropicClient(mockAnthropicClient);
  });

  describe('SYSTEM_PROMPT', () => {
    it('should be defined and contain task-related instructions', () => {
      expect(SYSTEM_PROMPT).toBeDefined();
      expect(SYSTEM_PROMPT).toContain('task organizer');
      expect(SYSTEM_PROMPT).toContain('## Today\'s Tasks');
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
      const taskResponse = '## Today\'s Tasks\n\n- [ ] Buy groceries\n- [ ] Call dentist';
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: taskResponse }]
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'test-session', message: 'I need to buy groceries and call dentist' });

      expect(response.status).toBe(200);
      expect(response.body.todoMarkdown).toContain('## Today\'s Tasks');
      expect(response.body.todoMarkdown).toContain('- [ ] Buy groceries');
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
      expect(callArgs.model).toBe('claude-sonnet-4-5-20250514');
      expect(callArgs.max_tokens).toBe(1024);
      expect(callArgs.system).toBe(SYSTEM_PROMPT);
      // Messages at time of call included only the user message
      expect(callArgs.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Test message' })
        ])
      );
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
  });
});
