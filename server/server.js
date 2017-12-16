require('shelljs/global');
const chalk = require('chalk');
const config = require('./config');
const io = require('socket.io').listen(config.socketPort);
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const _ = require('lodash');
const users = require('./db').users;
const cryptHelper = require('./cryptHelper');
const packageStr = require('./packageTemplate');

const node_modules = 'node_modules';
const downloadPath = path.resolve(__dirname, '../download');
fse.ensureDirSync(downloadPath); // 文件目录不存在则创建

const getUser = (username) => {
	return users.filter(user => username === user.username)[0] || {};
};

console.log('Server init successful.');

io.sockets.on('connection', (conn) => {
	let user = {};
	const loginValidate = (data) => {
		user = getUser(data.username);
		if (user.username !== data.username) {
			conn.emit('validation', '用户名错误');
			return true;
		}
		if (user.password !== data.password) {
			conn.emit('validation', '密码错误');
			return true;
		}
	};
	conn.on('error', function (err) {
		console.log('Caught flash policy server socket error: ');
		console.log(err.stack);
	});
	conn.on('login', function (data) {
		// console.log('client Request login: %s', JSON.stringify(data));
		if (loginValidate(data)) return;
		conn.emit('login_success', cryptHelper.encrypt(JSON.stringify(data)));
	});
	conn.on('data', function ({ authInfo, params }) {
		console.log('Client Request Token: %s', authInfo);
		if (authInfo && params) {
			// console.log('cryptoHelper.decrypt data: %s', cryptHelper.decrypt(authInfo));
			const jsonData = JSON.parse(cryptHelper.decrypt(authInfo));
			if (loginValidate(jsonData)) return;
			handleCommand(conn, params, user.username);
		}
	});
	conn.on('disconnect', function () {
		console.log('Server Socket disconnect username: %s', user.username);
		conn.disconnect();
	});
});

/**
 * 获取文件夹下面的所有的文件(包括子文件夹)
 * @param {String} dir
 * @returns {Array}
 */
const getAllFiles = (dir) => {
	let AllFiles = [];
	const iteration = (dirPath) => {
		const [dirs, files] = _(fs.readdirSync(dirPath)).partition(p => fs.statSync(path.join(dirPath, p)).isDirectory());
		files.forEach(file => AllFiles.push(path.join(dirPath, file)));
		for (const _dir of dirs) {
			iteration(path.join(dirPath, _dir));
		}
	};
	iteration(dir);
	return AllFiles;
};

const handleCommand = (conn, params, username) => {
	let result = '';
	const userPath = path.resolve(downloadPath, username);
	const watchPath = path.resolve(userPath, node_modules);
	let command = params.command;
	return Promise.resolve()
	.then(() => global.rm('-Rf', userPath))
	.then(() => global.mkdir(userPath))
	.then(() => global.mkdir(watchPath))
	.then(() => fs.writeFileSync(path.resolve(userPath, 'package.json'), JSON.stringify(packageStr, null, 4)))
	.then(() => global.cd(userPath))
	.then(() => {
		if (params.command.toLowerCase() !== 'login' && command) {
			console.log(`npm ${command}`);
			result = global.exec(`npm ${command}`).toString();
			if (result) {
				command = null;
			}
		}
	})
	.then(() => {
		global.cd(userPath);
		const filePaths = getAllFiles(watchPath);
		const list = [];
		for (const filePath of filePaths) {
			let newFilePath = filePath.split(username)[1];
			if (newFilePath) {
				let tmpArr = newFilePath.split(node_modules);
				tmpArr = tmpArr.slice(1, tmpArr.length);
				const _filePath = tmpArr.join(node_modules);
				if (_filePath) {
					list.push(_filePath);
				}
			}
		}
		conn.emit('data', { username, list });
		conn.emit('result', result);
	})
	// error catch
	.catch(e => {
		global.echo(chalk.red('Build failed. See below for errors.\n'));
		global.echo(chalk.red(e.stack));
		// process.exit(1);
	});
};