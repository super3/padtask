/**
 * @jest-environment jsdom
 */

describe('Frontend URL Routing', () => {
    let chats, currentSessionId, todoMarkdown, conversationHistory;
    let getChatIdFromUrl, updateUrl, loadChats, switchToChat, createNewChat;

    // Mock DOM elements the frontend code expects
    beforeEach(() => {
        // Reset state
        chats = [];
        currentSessionId = null;
        todoMarkdown = '';
        conversationHistory = [];

        // Clear localStorage
        localStorage.clear();

        // Reset URL hash
        window.location.hash = '';

        // Mock DOM elements
        document.body.innerHTML = `
            <div id="messages"></div>
            <input id="chatInput" />
            <button id="sendBtn"></button>
            <div id="todoContent"></div>
            <div id="todoStats"></div>
            <div id="chatList"></div>
            <div id="chatPanelTitle"></div>
            <div id="modelBadge"></div>
            <button id="newChatBtn"></button>
        `;

        // Define functions matching the frontend code
        getChatIdFromUrl = function() {
            const hash = window.location.hash;
            const match = hash.match(/^#\/chat\/(.+)$/);
            return match ? match[1] : null;
        };

        updateUrl = function(chatId) {
            history.replaceState(null, '', `#/chat/${chatId}`);
        };

        // Simplified mocks for UI functions
        const loadChatUI = jest.fn();
        const renderChatList = jest.fn();
        const resetChatUI = jest.fn();
        const updatePanelTitle = jest.fn();
        const updateTodoDisplay = jest.fn();
        const saveChats = function() {
            localStorage.setItem('padtask-chats', JSON.stringify(chats));
        };

        loadChats = function() {
            const saved = localStorage.getItem('padtask-chats');
            if (saved) {
                chats = JSON.parse(saved);
            }
            if (chats.length === 0) {
                createNewChat();
            } else {
                const urlChatId = getChatIdFromUrl();
                const chat = (urlChatId && chats.find(c => c.id === urlChatId)) || chats[0];
                currentSessionId = chat.id;
                todoMarkdown = chat.todoMarkdown || '';
                conversationHistory = chat.messages || [];
                loadChatUI(chat);
                updateUrl(chat.id);
            }
            renderChatList();
        };

        createNewChat = function() {
            const newId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            const chatNumber = chats.length + 1;
            const newChat = {
                id: newId,
                name: `Chat ${chatNumber}`,
                todoMarkdown: '',
                messages: []
            };
            chats.unshift(newChat);
            currentSessionId = newId;
            todoMarkdown = '';
            conversationHistory = [];
            saveChats();
            renderChatList();
            resetChatUI();
            updatePanelTitle();
            updateUrl(newId);
        };

        switchToChat = function(chatId) {
            const currentChat = chats.find(c => c.id === currentSessionId);
            if (currentChat) {
                currentChat.todoMarkdown = todoMarkdown;
                saveChats();
            }
            currentSessionId = chatId;
            const chat = chats.find(c => c.id === chatId);
            if (chat) {
                todoMarkdown = chat.todoMarkdown || '';
                conversationHistory = chat.messages || [];
                loadChatUI(chat);
                updateTodoDisplay();
                updateUrl(chatId);
            }
            renderChatList();
            updatePanelTitle();
        };
    });

    describe('getChatIdFromUrl', () => {
        it('should return null when no hash is present', () => {
            window.location.hash = '';
            expect(getChatIdFromUrl()).toBeNull();
        });

        it('should return null for non-matching hash formats', () => {
            window.location.hash = '#something-else';
            expect(getChatIdFromUrl()).toBeNull();
        });

        it('should extract chat ID from valid hash', () => {
            window.location.hash = '#/chat/session-123-abc';
            expect(getChatIdFromUrl()).toBe('session-123-abc');
        });

        it('should handle complex session IDs', () => {
            window.location.hash = '#/chat/session-1712428800000-abc123xyz';
            expect(getChatIdFromUrl()).toBe('session-1712428800000-abc123xyz');
        });
    });

    describe('updateUrl', () => {
        it('should set the URL hash to #/chat/<chatId>', () => {
            updateUrl('session-123-abc');
            expect(window.location.hash).toBe('#/chat/session-123-abc');
        });

        it('should use replaceState so it does not add history entries', () => {
            const spy = jest.spyOn(history, 'replaceState');
            updateUrl('session-456');
            expect(spy).toHaveBeenCalledWith(null, '', '#/chat/session-456');
            spy.mockRestore();
        });
    });

    describe('loadChats', () => {
        it('should create a new chat when no chats exist', () => {
            loadChats();
            expect(chats.length).toBe(1);
            expect(currentSessionId).toBe(chats[0].id);
            expect(window.location.hash).toContain('#/chat/');
        });

        it('should load the chat specified in the URL hash', () => {
            const targetChat = { id: 'session-target', name: 'Goals', todoMarkdown: '## Goals\n\n- [ ] Win', messages: [] };
            const otherChat = { id: 'session-other', name: 'test list', todoMarkdown: '', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([otherChat, targetChat]));

            window.location.hash = '#/chat/session-target';
            loadChats();

            expect(currentSessionId).toBe('session-target');
            expect(todoMarkdown).toBe('## Goals\n\n- [ ] Win');
        });

        it('should fall back to first chat when URL hash references nonexistent chat', () => {
            const chat = { id: 'session-exists', name: 'Chat 1', todoMarkdown: '', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([chat]));

            window.location.hash = '#/chat/session-deleted';
            loadChats();

            expect(currentSessionId).toBe('session-exists');
        });

        it('should fall back to first chat when no URL hash is present', () => {
            const chat1 = { id: 'session-first', name: 'Chat 1', todoMarkdown: 'first', messages: [] };
            const chat2 = { id: 'session-second', name: 'Chat 2', todoMarkdown: 'second', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([chat1, chat2]));

            window.location.hash = '';
            loadChats();

            expect(currentSessionId).toBe('session-first');
        });

        it('should update the URL after loading a chat', () => {
            const chat = { id: 'session-abc', name: 'Chat 1', todoMarkdown: '', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([chat]));

            loadChats();
            expect(window.location.hash).toBe('#/chat/session-abc');
        });
    });

    describe('createNewChat', () => {
        it('should update the URL to the new chat ID', () => {
            createNewChat();
            expect(window.location.hash).toBe(`#/chat/${currentSessionId}`);
        });

        it('should not change the URL to a previously active chat', () => {
            createNewChat();
            const firstId = currentSessionId;
            createNewChat();
            expect(currentSessionId).not.toBe(firstId);
            expect(window.location.hash).toBe(`#/chat/${currentSessionId}`);
        });
    });

    describe('switchToChat', () => {
        it('should update the URL to the switched chat ID', () => {
            const chat1 = { id: 'session-1', name: 'Goals', todoMarkdown: 'goals md', messages: [] };
            const chat2 = { id: 'session-2', name: 'test list', todoMarkdown: 'test md', messages: [] };
            chats = [chat1, chat2];
            currentSessionId = 'session-2';
            todoMarkdown = 'test md';

            switchToChat('session-1');

            expect(currentSessionId).toBe('session-1');
            expect(todoMarkdown).toBe('goals md');
            expect(window.location.hash).toBe('#/chat/session-1');
        });

        it('should preserve the previous chat state before switching', () => {
            const chat1 = { id: 'session-1', name: 'Goals', todoMarkdown: '', messages: [] };
            const chat2 = { id: 'session-2', name: 'test list', todoMarkdown: '', messages: [] };
            chats = [chat1, chat2];
            currentSessionId = 'session-1';
            todoMarkdown = 'updated goals markdown';

            switchToChat('session-2');

            expect(chat1.todoMarkdown).toBe('updated goals markdown');
        });
    });

    describe('refresh behavior (integration)', () => {
        it('should restore the same chat after simulated refresh', () => {
            // First "session": create two chats, switch to the first one (Goals)
            const goals = { id: 'session-goals', name: 'Goals', todoMarkdown: '## Goals\n\n- [ ] Be great', messages: [] };
            const testList = { id: 'session-test', name: 'test list', todoMarkdown: '', messages: [] };
            chats = [testList, goals]; // testList was created last, so it's at index 0
            localStorage.setItem('padtask-chats', JSON.stringify(chats));

            // User is on Goals and the URL reflects that
            window.location.hash = '#/chat/session-goals';

            // Simulate refresh: reset in-memory state and reload
            chats = [];
            currentSessionId = null;
            todoMarkdown = '';
            conversationHistory = [];

            loadChats();

            // Should restore Goals, not test list (which is chats[0])
            expect(currentSessionId).toBe('session-goals');
            expect(todoMarkdown).toBe('## Goals\n\n- [ ] Be great');
        });
    });
});
