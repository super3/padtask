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
            if (!match) return null;
            const id = match[1];
            return id.startsWith('session-') ? id.slice('session-'.length) : id;
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
                // Migrate: strip "session-" prefix from existing chat IDs
                let migrated = false;
                chats.forEach(chat => {
                    if (chat.id && chat.id.startsWith('session-')) {
                        chat.id = chat.id.slice('session-'.length);
                        migrated = true;
                    }
                });
                if (migrated) {
                    localStorage.setItem('padtask-chats', JSON.stringify(chats));
                }
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
            const newId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
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
            window.location.hash = '#/chat/chat-123-abc';
            expect(getChatIdFromUrl()).toBe('chat-123-abc');
        });

        it('should handle complex session IDs', () => {
            window.location.hash = '#/chat/chat-1712428800000-abc123xyz';
            expect(getChatIdFromUrl()).toBe('chat-1712428800000-abc123xyz');
        });

        it('should strip session- prefix from old bookmarked URLs', () => {
            window.location.hash = '#/chat/session-1767110758398-zetp3mf4a';
            expect(getChatIdFromUrl()).toBe('1767110758398-zetp3mf4a');
        });
    });

    describe('updateUrl', () => {
        it('should set the URL hash to #/chat/<chatId>', () => {
            updateUrl('chat-123-abc');
            expect(window.location.hash).toBe('#/chat/chat-123-abc');
        });

        it('should use replaceState so it does not add history entries', () => {
            const spy = jest.spyOn(history, 'replaceState');
            updateUrl('chat-456');
            expect(spy).toHaveBeenCalledWith(null, '', '#/chat/chat-456');
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
            const targetChat = { id: 'chat-target', name: 'Goals', todoMarkdown: '## Goals\n\n- [ ] Win', messages: [] };
            const otherChat = { id: 'chat-other', name: 'test list', todoMarkdown: '', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([otherChat, targetChat]));

            window.location.hash = '#/chat/chat-target';
            loadChats();

            expect(currentSessionId).toBe('chat-target');
            expect(todoMarkdown).toBe('## Goals\n\n- [ ] Win');
        });

        it('should fall back to first chat when URL hash references nonexistent chat', () => {
            const chat = { id: 'chat-exists', name: 'Chat 1', todoMarkdown: '', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([chat]));

            window.location.hash = '#/chat/chat-deleted';
            loadChats();

            expect(currentSessionId).toBe('chat-exists');
        });

        it('should fall back to first chat when no URL hash is present', () => {
            const chat1 = { id: 'chat-first', name: 'Chat 1', todoMarkdown: 'first', messages: [] };
            const chat2 = { id: 'chat-second', name: 'Chat 2', todoMarkdown: 'second', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([chat1, chat2]));

            window.location.hash = '';
            loadChats();

            expect(currentSessionId).toBe('chat-first');
        });

        it('should update the URL after loading a chat', () => {
            const chat = { id: 'chat-abc', name: 'Chat 1', todoMarkdown: '', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([chat]));

            loadChats();
            expect(window.location.hash).toBe('#/chat/chat-abc');
        });

        it('should migrate chat IDs by stripping session- prefix', () => {
            const chat1 = { id: 'session-1767110758398-zetp3mf4a', name: 'Chat 1', todoMarkdown: '', messages: [] };
            const chat2 = { id: '1767110758399-abc123', name: 'Chat 2', todoMarkdown: '', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([chat1, chat2]));

            loadChats();

            expect(chats[0].id).toBe('1767110758398-zetp3mf4a');
            expect(chats[1].id).toBe('1767110758399-abc123');
            // Verify localStorage was updated
            const saved = JSON.parse(localStorage.getItem('padtask-chats'));
            expect(saved[0].id).toBe('1767110758398-zetp3mf4a');
        });

        it('should load chat from URL with session- prefix after migration', () => {
            const chat = { id: 'session-123-abc', name: 'Chat 1', todoMarkdown: '## Tasks', messages: [] };
            localStorage.setItem('padtask-chats', JSON.stringify([chat]));
            window.location.hash = '#/chat/session-123-abc';

            loadChats();

            expect(currentSessionId).toBe('123-abc');
            expect(todoMarkdown).toBe('## Tasks');
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
            const chat1 = { id: 'chat-1', name: 'Goals', todoMarkdown: 'goals md', messages: [] };
            const chat2 = { id: 'chat-2', name: 'test list', todoMarkdown: 'test md', messages: [] };
            chats = [chat1, chat2];
            currentSessionId = 'chat-2';
            todoMarkdown = 'test md';

            switchToChat('chat-1');

            expect(currentSessionId).toBe('chat-1');
            expect(todoMarkdown).toBe('goals md');
            expect(window.location.hash).toBe('#/chat/chat-1');
        });

        it('should preserve the previous chat state before switching', () => {
            const chat1 = { id: 'chat-1', name: 'Goals', todoMarkdown: '', messages: [] };
            const chat2 = { id: 'chat-2', name: 'test list', todoMarkdown: '', messages: [] };
            chats = [chat1, chat2];
            currentSessionId = 'chat-1';
            todoMarkdown = 'updated goals markdown';

            switchToChat('chat-2');

            expect(chat1.todoMarkdown).toBe('updated goals markdown');
        });
    });

    describe('refresh behavior (integration)', () => {
        it('should restore the same chat after simulated refresh', () => {
            // First "session": create two chats, switch to the first one (Goals)
            const goals = { id: 'chat-goals', name: 'Goals', todoMarkdown: '## Goals\n\n- [ ] Be great', messages: [] };
            const testList = { id: 'chat-test', name: 'test list', todoMarkdown: '', messages: [] };
            chats = [testList, goals]; // testList was created last, so it's at index 0
            localStorage.setItem('padtask-chats', JSON.stringify(chats));

            // User is on Goals and the URL reflects that
            window.location.hash = '#/chat/chat-goals';

            // Simulate refresh: reset in-memory state and reload
            chats = [];
            currentSessionId = null;
            todoMarkdown = '';
            conversationHistory = [];

            loadChats();

            // Should restore Goals, not test list (which is chats[0])
            expect(currentSessionId).toBe('chat-goals');
            expect(todoMarkdown).toBe('## Goals\n\n- [ ] Be great');
        });
    });
});
