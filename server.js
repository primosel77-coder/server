const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8 // Устанавливаем лимит 100 МБ (100 * 1024 * 1024)
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let usersDB = {}; 
let messagesHistory = []; 
let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        if (usersDB[data.username]) return socket.emit('auth_error', 'Ник занят');
        usersDB[data.username] = { 
            password: data.password, 
            bio: "Юзер AllWhite", 
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=random` 
        };
        socket.emit('register_success');
    });

    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            socket.emit('login_success', { 
                username: data.username,
                avatar: user.avatar,
                allUsers: Object.keys(usersDB).map(name => ({ 
                    name, online: !!onlineUsers[name], avatar: usersDB[name].avatar 
                }))
            });
            io.emit('update_user_list', Object.keys(usersDB).map(name => ({ 
                name, online: !!onlineUsers[name], avatar: usersDB[name].avatar 
            })));
        } else {
            socket.emit('auth_error', 'Ошибка входа');
        }
    });

    // Обработка сообщений и файлов
    socket.on('private_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (sender) {
            const msg = { 
                ...data, 
                from: sender, 
                time: new Date().toLocaleTimeString(),
                isFile: !!data.fileData // Флаг, если это файл
            };
            messagesHistory.push(msg);
            if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('private_message', msg);
            socket.emit('private_message', msg);
        }
    });

    socket.on('disconnect', () => {
        const name = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (name) {
            delete onlineUsers[name];
            io.emit('update_user_list', Object.keys(usersDB).map(n => ({ 
                name: n, online: !!onlineUsers[n], avatar: usersDB[n].avatar 
            })));
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server running with 100MB support'));
