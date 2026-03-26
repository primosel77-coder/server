const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'] // Помогает избежать ERR_CONNECTION_RESET
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let usersDB = {}; 
let onlineUsers = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register', (data) => {
        if (!data.username || !data.password) return;
        if (usersDB[data.username]) {
            return socket.emit('auth_error', 'Этот ник уже занят!');
        }
        usersDB[data.username] = { password: data.password };
        console.log('Registered:', data.username);
        socket.emit('register_success');
    });

    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            socket.emit('login_success', { 
                username: data.username,
                allUsers: Object.keys(usersDB).map(name => ({ name, online: !!onlineUsers[name] }))
            });
            console.log('Login success:', data.username);
        } else {
            socket.emit('auth_error', 'Неверный логин или пароль!');
        }
    });

    socket.on('disconnect', () => {
        for (let user in onlineUsers) {
            if (onlineUsers[user] === socket.id) {
                delete onlineUsers[user];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('AllWhite Live on port ' + PORT));
