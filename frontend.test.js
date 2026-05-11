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

describe('mergeServerConversations (cross-device sync)', () => {
    // Mirrors the production mergeServerConversations in index.html.
    let chats, currentSessionId, todoMarkdown, conversationHistory;
    let mergeServerConversations, loadChatUI;

    beforeEach(() => {
        chats = [];
        currentSessionId = null;
        todoMarkdown = '';
        conversationHistory = [];
        localStorage.clear();
        window.location.hash = '';

        loadChatUI = jest.fn();
        const renderChatList = jest.fn();
        const updatePanelTitle = jest.fn();
        const saveChats = () => localStorage.setItem('padtask-chats', JSON.stringify(chats));
        const updateUrl = (id) => history.replaceState(null, '', `#/chat/${id}`);
        const getChatIdFromUrl = () => {
            const m = window.location.hash.match(/^#\/chat\/(.+)$/);
            return m ? m[1] : null;
        };

        mergeServerConversations = function(serverConvos) {
            if (!serverConvos.length) return;
            let addedNewChat = false;
            let currentChatUpdated = false;
            serverConvos.forEach(sc => {
                const existing = chats.find(c => c.id === sc.sessionId);
                if (existing) {
                    existing.messages = sc.messages || existing.messages;
                    if (existing.id === currentSessionId) currentChatUpdated = true;
                } else {
                    const firstUserMsg = (sc.messages || []).find(m => m.role === 'user');
                    const name = firstUserMsg
                        ? firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '')
                        : `Chat ${chats.length + 1}`;
                    chats.push({
                        id: sc.sessionId,
                        name,
                        todoMarkdown: '',
                        messages: sc.messages || []
                    });
                    addedNewChat = true;
                }
            });

            if (addedNewChat) {
                const currentChat = chats.find(c => c.id === currentSessionId);
                const placeholderEmpty =
                    currentChat &&
                    (!currentChat.messages || currentChat.messages.length === 0) &&
                    !(currentChat.todoMarkdown && currentChat.todoMarkdown.trim());
                if (placeholderEmpty) {
                    chats = chats.filter(c => c.id !== currentSessionId);
                    const urlChatId = getChatIdFromUrl();
                    const target =
                        (urlChatId && chats.find(c => c.id === urlChatId)) || chats[0];
                    if (target) {
                        currentSessionId = target.id;
                        todoMarkdown = target.todoMarkdown || '';
                        conversationHistory = target.messages || [];
                        loadChatUI(target);
                        updateUrl(target.id);
                        updatePanelTitle();
                        currentChatUpdated = false;
                    }
                }
            }

            if (currentChatUpdated) {
                const cur = chats.find(c => c.id === currentSessionId);
                if (cur) {
                    conversationHistory = cur.messages || [];
                    loadChatUI(cur);
                }
            }

            saveChats();
            renderChatList();
        };
    });

    it('switches to most-recent server chat when only an empty placeholder exists', () => {
        // Simulate fresh-device state: loadChats() created an empty placeholder
        chats = [{ id: 'placeholder', name: 'Chat 1', todoMarkdown: '', messages: [] }];
        currentSessionId = 'placeholder';

        // Server returns chats in updated_at DESC order (most-recent first)
        mergeServerConversations([
            { sessionId: 'srv-newest', messages: [{ role: 'user', content: 'Hello there' }] },
            { sessionId: 'srv-older', messages: [{ role: 'user', content: 'Older chat' }] }
        ]);

        expect(chats.find(c => c.id === 'placeholder')).toBeUndefined();
        expect(currentSessionId).toBe('srv-newest');
        expect(conversationHistory).toEqual([{ role: 'user', content: 'Hello there' }]);
        expect(loadChatUI).toHaveBeenCalled();
        expect(window.location.hash).toBe('#/chat/srv-newest');
    });

    it('honors URL-targeted chat when dropping placeholder', () => {
        chats = [{ id: 'placeholder', name: 'Chat 1', todoMarkdown: '', messages: [] }];
        currentSessionId = 'placeholder';
        window.location.hash = '#/chat/srv-older';

        mergeServerConversations([
            { sessionId: 'srv-newest', messages: [{ role: 'user', content: 'a' }] },
            { sessionId: 'srv-older', messages: [{ role: 'user', content: 'b' }] }
        ]);

        expect(currentSessionId).toBe('srv-older');
    });

    it('does not drop the active chat if it has messages', () => {
        chats = [{
            id: 'local-active',
            name: 'Local',
            todoMarkdown: '',
            messages: [{ role: 'user', content: 'local message' }]
        }];
        currentSessionId = 'local-active';

        mergeServerConversations([
            { sessionId: 'srv-1', messages: [{ role: 'user', content: 'srv msg' }] }
        ]);

        expect(currentSessionId).toBe('local-active');
        expect(chats.find(c => c.id === 'local-active')).toBeDefined();
        expect(chats.find(c => c.id === 'srv-1')).toBeDefined();
    });

    it('does not drop the active chat if it has unsaved tasks', () => {
        chats = [{
            id: 'placeholder-with-tasks',
            name: 'Chat 1',
            todoMarkdown: '## Tasks\n\n- [ ] something',
            messages: []
        }];
        currentSessionId = 'placeholder-with-tasks';

        mergeServerConversations([
            { sessionId: 'srv-1', messages: [{ role: 'user', content: 'srv msg' }] }
        ]);

        expect(currentSessionId).toBe('placeholder-with-tasks');
    });

    it('refreshes the visible chat when its server messages change', () => {
        chats = [{
            id: 'shared',
            name: 'Shared',
            todoMarkdown: '',
            messages: [{ role: 'user', content: 'old' }]
        }];
        currentSessionId = 'shared';

        mergeServerConversations([
            {
                sessionId: 'shared',
                messages: [
                    { role: 'user', content: 'old' },
                    { role: 'assistant', content: 'new from other device' }
                ]
            }
        ]);

        expect(conversationHistory).toEqual([
            { role: 'user', content: 'old' },
            { role: 'assistant', content: 'new from other device' }
        ]);
        expect(loadChatUI).toHaveBeenCalledWith(chats.find(c => c.id === 'shared'));
    });

    it('returns early when server returns no conversations', () => {
        chats = [{ id: 'placeholder', name: 'Chat 1', todoMarkdown: '', messages: [] }];
        currentSessionId = 'placeholder';

        mergeServerConversations([]);

        expect(currentSessionId).toBe('placeholder');
        expect(loadChatUI).not.toHaveBeenCalled();
    });
});

describe('Click-to-quote task text extraction', () => {
    // Mirrors the extraction logic in updateTodoDisplay's li click handler in
    // index.html. The li structure at click time is:
    //   <li><input type="checkbox"><span>task text <a>link</a></span></li>
    // Previously the handler iterated only TEXT_NODE children of the li, which
    // broke when task text was moved into a wrapper span for link layout fix.
    function extractTaskText(li) {
        let text = '';
        li.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (
                node.nodeType === Node.ELEMENT_NODE &&
                node.tagName !== 'INPUT'
            ) {
                text += node.textContent;
            }
        });
        return text.trim();
    }

    function buildLi(innerHTML) {
        const container = document.createElement('ul');
        container.innerHTML = `<li>${innerHTML}</li>`;
        const li = container.querySelector('li');
        // Apply the same wrap-after-checkbox transform as updateTodoDisplay
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox) {
            const span = document.createElement('span');
            while (checkbox.nextSibling) {
                span.appendChild(checkbox.nextSibling);
            }
            li.appendChild(span);
        }
        return li;
    }

    it('extracts plain task text from a wrapper span', () => {
        const li = buildLi('<input type="checkbox"> Buy milk');
        expect(extractTaskText(li)).toBe('Buy milk');
    });

    it('extracts task text that includes a rendered link', () => {
        const li = buildLi('<input type="checkbox"> Read <a href="https://example.com">docs</a> today');
        expect(extractTaskText(li)).toBe('Read docs today');
    });

    it('still works when text is a direct text node of the li (no wrapper)', () => {
        // Simulate an li that was never wrapped (defensive path)
        const container = document.createElement('ul');
        container.innerHTML = '<li><input type="checkbox"> Legacy task</li>';
        const li = container.querySelector('li');
        expect(extractTaskText(li)).toBe('Legacy task');
    });

    it('returns empty string for an li with no task text', () => {
        const container = document.createElement('ul');
        container.innerHTML = '<li><input type="checkbox"></li>';
        const li = container.querySelector('li');
        expect(extractTaskText(li)).toBe('');
    });
});
