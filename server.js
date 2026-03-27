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
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(usersDB, null, 2));
        fs.writeFileSync(MSGS_FILE, JSON.stringify(messagesHistory, null, 2));
    } catch (e) { console.log("Save error:", e); }
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            const myFriends = user.friends.map(fName => ({
                name: fName, online: !!onlineUsers[fName], avatar: usersDB[fName]?.avatar || '', bio: usersDB[fName]?.bio || ''
            }));
            socket.emit('login_success', { 
                username: data.username, avatar: user.avatar, bio: user.bio, friends: myFriends,
                history: messagesHistory.filter(m => m.from === data.username || m.to === data.username)
            });
            user.friends.forEach(fName => {
                if (onlineUsers[fName]) io.to(onlineUsers[fName]).emit('friend_updated', { name: data.username, online: true });
            });
        } else { socket.emit('auth_error', 'Ошибка входа'); }
    });

    socket.on('register', (data) => {
        if (!data.username || usersDB[data.username]) return socket.emit('auth_error', 'Ник занят или пуст');
        usersDB[data.username] = { 
            password: data.password, bio: "Юзер AllWhite", 
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=8b0000&color=fff`,
            friends: [] 
        };
        saveData();
        socket.emit('register_success');
    });

    socket.on('update_profile', (data) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[me]) {
            if (data.avatar) usersDB[me].avatar = data.avatar;
            if (data.bio) usersDB[me].bio = data.bio;
            saveData();
            socket.emit('profile_updated', { avatar: usersDB[me].avatar, bio: usersDB[me].bio });
        }
    });

    socket.on('private_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (sender) {
            const msg = { 
                id: Math.random().toString(36).substr(2, 9),
                from: sender, to: data.to, text: data.text, type: data.type, fileData: data.fileData, fileName: data.fileName,
                time: new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) 
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
            usersDB[me].friends.push(name);
            usersDB[name].friends.push(me);
            saveData();
            socket.emit('friend_added', { name, online: !!onlineUsers[name], avatar: usersDB[name].avatar });
        }
    });

    socket.on('disconnect', () => {
        const name = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (name) {
            delete onlineUsers[name];
            usersDB[name]?.friends.forEach(f => {
                if (onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', { name, online: false });
            });
        }
    });
});

http.listen(process.env.PORT || 3000, () => console.log('Server OK'));
