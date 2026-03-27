const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8 // 100MB
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let usersDB = {}; 
let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        // Проверка на пустые поля
        if (!data.username || data.username.trim() === "" || !data.password) {
            return socket.emit('auth_error', 'Заполни все поля!');
        }
        // Проверка на занятый ник
        if (usersDB[data.username]) {
            return socket.emit('auth_error', 'Этот ник уже занят!');
        }
        
        usersDB[data.username] = { 
            password: data.password, 
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=8b0000&color=fff`,
            friends: [] 
        };
        socket.emit('register_success');
        console.log(`Зарегистрирован: ${data.username}`);
    });

    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            const myFriends = user.friends.map(fName => ({
                name: fName,
                online: !!onlineUsers[fName],
                avatar: usersDB[fName] ? usersDB[fName].avatar : ''
            }));
            socket.emit('login_success', { 
                username: data.username, 
                avatar: user.avatar,
                friends: myFriends 
            });
            user.friends.forEach(fName => {
                if (onlineUsers[fName]) io.to(onlineUsers[fName]).emit('friend_status_change', { name: data.username, online: true });
            });
        } else {
            socket.emit('auth_error', 'Неверный логин или пароль');
        }
    });

    socket.on('add_friend', (friendName) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[friendName] && me !== friendName) {
            if (!usersDB[me].friends.includes(friendName)) {
                usersDB[me].friends.push(friendName);
                if (!usersDB[friendName].friends.includes(me)) usersDB[friendName].friends.push(me);
                socket.emit('friend_added', { 
                    name: friendName, 
                    online: !!onlineUsers[friendName], 
                    avatar: usersDB[friendName].avatar 
                });
            } else {
                socket.emit('auth_error', 'Он уже в друзьях');
            }
        } else {
            socket.emit('auth_error', 'Пользователь не найден');
        }
    });

    socket.on('private_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (sender && onlineUsers[data.to]) {
            const msg = { ...data, from: sender, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
            io.to(onlineUsers[data.to]).emit('private_message', msg);
            socket.emit('private_message', msg);
        }
    });

    socket.on('disconnect', () => {
        const name = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (name) {
            delete onlineUsers[name];
            if (usersDB[name]) {
                usersDB[name].friends.forEach(fName => {
                    if (onlineUsers[fName]) io.to(onlineUsers[fName]).emit('friend_status_change', { name, online: false });
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('AllWhite V3.1 Live'));
