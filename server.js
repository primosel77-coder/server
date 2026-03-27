const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8 // 100MB для файлов, аватарок и голосовых
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let usersDB = {}; 
let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        if (!data.username || data.username.trim() === "" || !data.password) {
            return socket.emit('auth_error', 'Заполни все поля!');
        }
        if (usersDB[data.username]) {
            return socket.emit('auth_error', 'Ник занят!');
        }
        
        usersDB[data.username] = { 
            password: data.password, 
            bio: "На связи",
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=8b0000&color=fff`,
            friends: [] 
        };
        socket.emit('register_success');
    });

    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            const myFriends = user.friends.map(fName => ({
                name: fName,
                online: !!onlineUsers[fName],
                avatar: usersDB[fName] ? usersDB[fName].avatar : '',
                bio: usersDB[fName] ? usersDB[fName].bio : ''
            }));
            socket.emit('login_success', { 
                username: data.username, 
                avatar: user.avatar,
                bio: user.bio,
                friends: myFriends 
            });
            user.friends.forEach(fName => {
                if (onlineUsers[fName]) io.to(onlineUsers[fName]).emit('friend_updated', { name: data.username, online: true, avatar: user.avatar, bio: user.bio });
            });
        } else {
            socket.emit('auth_error', 'Неверный логин/пароль');
        }
    });

    socket.on('update_profile', (data) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[me]) {
            if (data.avatar) usersDB[me].avatar = data.avatar;
            if (data.bio) usersDB[me].bio = data.bio;
            socket.emit('profile_updated', { avatar: usersDB[me].avatar, bio: usersDB[me].bio });
            
            // Обновляем инфу у друзей
            usersDB[me].friends.forEach(fName => {
                if (onlineUsers[fName]) io.to(onlineUsers[fName]).emit('friend_updated', { name: me, online: true, avatar: usersDB[me].avatar, bio: usersDB[me].bio });
            });
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
                    avatar: usersDB[friendName].avatar,
                    bio: usersDB[friendName].bio
                });
            } else { socket.emit('auth_error', 'Уже в друзьях'); }
        } else { socket.emit('auth_error', 'Пользователь не найден'); }
    });

    socket.on('private_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (sender && onlineUsers[data.to]) {
            const msg = { 
                ...data, 
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5), // Уникальный ID для удаления
                from: sender, 
                time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
            };
            io.to(onlineUsers[data.to]).emit('private_message', msg);
            socket.emit('private_message', msg);
        }
    });

    socket.on('delete_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (sender && onlineUsers[data.to]) {
            io.to(onlineUsers[data.to]).emit('message_deleted', data.msgId);
            socket.emit('message_deleted', data.msgId);
        }
    });

    socket.on('disconnect', () => {
        const name = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (name) {
            delete onlineUsers[name];
            if (usersDB[name]) {
                usersDB[name].friends.forEach(fName => {
                    if (onlineUsers[fName]) io.to(onlineUsers[fName]).emit('friend_updated', { name, online: false, avatar: usersDB[name].avatar, bio: usersDB[name].bio });
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('AllWhite V4 Live'));
