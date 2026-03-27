const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = './users.json';
const MSGS_FILE = './messages.json';

let usersDB = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : {};
let messagesHistory = fs.existsSync(MSGS_FILE) ? JSON.parse(fs.readFileSync(MSGS_FILE)) : [];
let onlineUsers = {};

const saveData = () => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersDB, null, 2));
    fs.writeFileSync(MSGS_FILE, JSON.stringify(messagesHistory, null, 2));
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            const friendsData = user.friends.map(f => ({
                name: f, online: !!onlineUsers[f], 
                avatar: usersDB[f]?.avatar || '', bio: usersDB[f]?.bio || ''
            }));
            socket.emit('login_success', { 
                username: data.username, avatar: user.avatar, bio: user.bio, friends: friendsData,
                history: messagesHistory.filter(m => m.from === data.username || m.to === data.username)
            });
            user.friends.forEach(f => { if(onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', {name:data.username, online:true}); });
        } else { socket.emit('auth_error', 'Ошибка входа'); }
    });

    socket.on('register', (data) => {
        if (!data.username || usersDB[data.username]) return socket.emit('auth_error', 'Ник занят');
        usersDB[data.username] = { 
            password: data.password, bio: "На связи AllWhite", 
            avatar: `https://ui-avatars.com/api/?name=${data.username}&background=8b0000&color=fff`,
            friends: [] 
        };
        saveData();
        socket.emit('register_success');
    });

    socket.on('private_message', (data) => {
        const from = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (from) {
            const msg = { 
                id: Date.now(), from, to: data.to, text: data.text, type: data.type, 
                fileData: data.fileData, fileName: data.fileName,
                time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) 
            };
            messagesHistory.push(msg);
            saveData();
            if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('private_message', msg);
            socket.emit('private_message', msg);
        }
    });

    socket.on('add_friend', (name) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[name] && me !== name && !usersDB[me].friends.includes(name)) {
            usersDB[me].friends.push(name); usersDB[name].friends.push(me);
            saveData();
            socket.emit('friend_added', {name, online: !!onlineUsers[name], avatar: usersDB[name].avatar});
        }
    });

    socket.on('disconnect', () => {
        const name = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (name) {
            delete onlineUsers[name];
            usersDB[name].friends.forEach(f => { if(onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', {name, online:false}); });
        }
    });
});

http.listen(process.env.PORT || 3000, () => console.log('Server Start'));const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = './users.json';
const MSGS_FILE = './messages.json';

let usersDB = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : {};
let messagesHistory = fs.existsSync(MSGS_FILE) ? JSON.parse(fs.readFileSync(MSGS_FILE)) : [];
let onlineUsers = {};

const saveData = () => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersDB, null, 2));
    fs.writeFileSync(MSGS_FILE, JSON.stringify(messagesHistory, null, 2));
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            const friendsData = user.friends.map(f => ({
                name: f, online: !!onlineUsers[f], 
                avatar: usersDB[f]?.avatar || '', bio: usersDB[f]?.bio || ''
            }));
            socket.emit('login_success', { 
                username: data.username, avatar: user.avatar, bio: user.bio, friends: friendsData,
                history: messagesHistory.filter(m => m.from === data.username || m.to === data.username)
            });
            user.friends.forEach(f => { if(onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', {name:data.username, online:true}); });
        } else { socket.emit('auth_error', 'Ошибка входа'); }
    });

    socket.on('register', (data) => {
        if (!data.username || usersDB[data.username]) return socket.emit('auth_error', 'Ник занят');
        usersDB[data.username] = { 
            password: data.password, bio: "На связи AllWhite", 
            avatar: `https://ui-avatars.com/api/?name=${data.username}&background=8b0000&color=fff`,
            friends: [] 
        };
        saveData();
        socket.emit('register_success');
    });

    socket.on('private_message', (data) => {
        const from = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (from) {
            const msg = { 
                id: Date.now(), from, to: data.to, text: data.text, type: data.type, 
                fileData: data.fileData, fileName: data.fileName,
                time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) 
            };
            messagesHistory.push(msg);
            saveData();
            if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('private_message', msg);
            socket.emit('private_message', msg);
        }
    });

    socket.on('add_friend', (name) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[name] && me !== name && !usersDB[me].friends.includes(name)) {
            usersDB[me].friends.push(name); usersDB[name].friends.push(me);
            saveData();
            socket.emit('friend_added', {name, online: !!onlineUsers[name], avatar: usersDB[name].avatar});
        }
    });

    socket.on('disconnect', () => {
        const name = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (name) {
            delete onlineUsers[name];
            usersDB[name].friends.forEach(f => { if(onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', {name, online:false}); });
        }
    });
});

http.listen(process.env.PORT || 3000, () => console.log('Server Start'));const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = './users.json';
const MSGS_FILE = './messages.json';

let usersDB = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : {};
let messagesHistory = fs.existsSync(MSGS_FILE) ? JSON.parse(fs.readFileSync(MSGS_FILE)) : [];
let onlineUsers = {};

const saveData = () => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersDB, null, 2));
    fs.writeFileSync(MSGS_FILE, JSON.stringify(messagesHistory, null, 2));
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            const friendsData = user.friends.map(f => ({
                name: f, online: !!onlineUsers[f], 
                avatar: usersDB[f]?.avatar || '', bio: usersDB[f]?.bio || ''
            }));
            socket.emit('login_success', { 
                username: data.username, avatar: user.avatar, bio: user.bio, friends: friendsData,
                history: messagesHistory.filter(m => m.from === data.username || m.to === data.username)
            });
            user.friends.forEach(f => { if(onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', {name:data.username, online:true}); });
        } else { socket.emit('auth_error', 'Ошибка входа'); }
    });

    socket.on('register', (data) => {
        if (!data.username || usersDB[data.username]) return socket.emit('auth_error', 'Ник занят');
        usersDB[data.username] = { 
            password: data.password, bio: "На связи AllWhite", 
            avatar: `https://ui-avatars.com/api/?name=${data.username}&background=8b0000&color=fff`,
            friends: [] 
        };
        saveData();
        socket.emit('register_success');
    });

    socket.on('private_message', (data) => {
        const from = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (from) {
            const msg = { 
                id: Date.now(), from, to: data.to, text: data.text, type: data.type, 
                fileData: data.fileData, fileName: data.fileName,
                time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) 
            };
            messagesHistory.push(msg);
            saveData();
            if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('private_message', msg);
            socket.emit('private_message', msg);
        }
    });

    socket.on('add_friend', (name) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[name] && me !== name && !usersDB[me].friends.includes(name)) {
            usersDB[me].friends.push(name); usersDB[name].friends.push(me);
            saveData();
            socket.emit('friend_added', {name, online: !!onlineUsers[name], avatar: usersDB[name].avatar});
        }
    });

    socket.on('disconnect', () => {
        const name = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (name) {
            delete onlineUsers[name];
            usersDB[name].friends.forEach(f => { if(onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', {name, online:false}); });
        }
    });
});

http.listen(process.env.PORT || 3000, () => console.log('Server Start'));
