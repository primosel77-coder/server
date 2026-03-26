const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

// Указываем серверу, где искать файлы (index.html должен быть в папке public)
app.use(express.static(path.join(__dirname, 'public')));

let usersDB = {}; 
let messagesHistory = []; 
let onlineUsers = {}; 

io.on('connection', (socket) => {
    console.log('Новое подключение');

    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            socket.emit('login_success', { 
                username: data.username, 
                allUsers: Object.keys(usersDB).map(name => ({ name, online: !!onlineUsers[name] })),
                history: messagesHistory.filter(m => m.from === data.username || m.to === data.username)
            });
        }
    });

    socket.on('private_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (sender) {
            const msg = { ...data, from: sender, time: new Date().toLocaleTimeString() };
            messagesHistory.push(msg);
            if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('private_message', msg);
            socket.emit('private_message', msg);
        }
    });

    socket.on('disconnect', () => {
        const user = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (user) delete onlineUsers[user];
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server running on port ' + PORT));
