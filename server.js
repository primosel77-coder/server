const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { maxHttpBufferSize: 1e7 }); 
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let usersDB = {}; 
let messagesHistory = []; 
let onlineUsers = {}; 

const getSafeList = () => Object.keys(usersDB).map(name => ({
    name, 
    avatar: usersDB[name].avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`, 
    bio: usersDB[name].bio || "Online", 
    online: !!onlineUsers[name] 
}));

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        if (!data.username || usersDB[data.username]) return socket.emit('auth_error', 'Ник занят');
        usersDB[data.username] = { password: data.password, avatar: '', bio: "New user" };
        socket.emit('register_success', { user: data.username });
    });

    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            socket.emit('login_success', { 
                username: data.username, 
                avatar: user.avatar,
                bio: user.bio,
                allUsers: getSafeList(),
                history: messagesHistory.filter(m => m.from === data.username || m.to === data.username)
            });
            io.emit('refresh_user_list', getSafeList());
        } else { socket.emit('auth_error', 'Ошибка входа'); }
    });

    socket.on('update_profile', (data) => {
        const oldNick = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (!oldNick) return;
        let currentNick = oldNick;

        if (data.newNick && data.newNick !== oldNick) {
            if (usersDB[data.newNick]) return socket.emit('auth_error', 'Ник занят');
            usersDB[data.newNick] = usersDB[oldNick];
            delete usersDB[oldNick];
            onlineUsers[data.newNick] = socket.id;
            delete onlineUsers[oldNick];
            messagesHistory.forEach(m => { if(m.from === oldNick) m.from = data.newNick; if(m.to === oldNick) m.to = data.newNick; });
            currentNick = data.newNick;
            socket.emit('nick_changed', currentNick);
        }

        if (data.newAvatar) usersDB[currentNick].avatar = data.newAvatar;
        if (data.newBio !== undefined) usersDB[currentNick].bio = data.newBio;

        socket.emit('login_success', {
            username: currentNick,
            avatar: usersDB[currentNick].avatar,
            bio: usersDB[currentNick].bio,
            allUsers: getSafeList(),
            history: messagesHistory.filter(m => m.from === currentNick || m.to === currentNick)
        });
        io.emit('refresh_user_list', getSafeList());
    });

    socket.on('private_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (!sender) return;
        const msg = { ...data, id: Date.now(), from: sender, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        messagesHistory.push(msg);
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('private_message', msg);
        socket.emit('private_message', msg);
    });

    socket.on('disconnect', () => {
        const user = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (user) { delete onlineUsers[user]; io.emit('refresh_user_list', getSafeList()); }
    });
});

http.listen(3000, () => console.log('AllWhite V3 Live on :3000'));