const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8 // Поддержка файлов до 100МБ
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let usersDB = {}; // { ник: { password, avatar, friends: [] } }
let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        if (usersDB[data.username]) return socket.emit('auth_error', 'Ник занят');
        usersDB[data.username] = { 
            password: data.password, 
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=random`,
            friends: [] 
        };
        socket.emit('register_success');
    });

    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            // Отправляем данные только о друзьях
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
            // Уведомляем друзей, что мы в сети
            user.friends.forEach(fName => {
                if (onlineUsers[fName]) io.to(onlineUsers[fName]).emit('friend_status_change', { name: data.username, online: true });
            });
        } else {
            socket.emit('auth_error', 'Ошибка входа');
        }
    });

    socket.on('add_friend', (friendName) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[friendName] && me !== friendName) {
            if (!usersDB[me].friends.includes(friendName)) {
                usersDB[me].friends.push(friendName);
                // Взаимное добавление для простоты
                if (!usersDB[friendName].friends.includes(me)) usersDB[friendName].friends.push(me);
                
                socket.emit('friend_added', { 
                    name: friendName, 
                    online: !!onlineUsers[friendName], 
                    avatar: usersDB[friendName].avatar 
                });
            }
        } else {
            socket.emit('auth_error', 'Пользователь не найден');
        }
    });

    socket.on('private_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (sender && onlineUsers[data.to]) {
            const msg = { ...data, from: sender, time: new Date().toLocaleTimeString() };
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
http.listen(PORT, () => console.log('AllWhite V3: Friends & Auth system ready'));
