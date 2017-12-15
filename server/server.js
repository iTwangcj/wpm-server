require('shelljs/global');
const chalk = require('chalk');
const io = require('socket.io').listen(3000);
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
		console.log('socket disconnect username: %s', user.username);
	});
});

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
		// 获得当前文件夹下的所有的文件夹和文件
		const files = getAllFiles(watchPath);
		console.log('文件总数: ', files.length);
		// 队列发送数据，每轮10跳数据
		const step = 1000;
		let filePathList = [], start = 0, end = step;
		const pushData = () => {
			filePathList = files.slice(start, end);
			for (const filePath of filePathList) {
				sendDataToClient(conn, filePath, params.node_modules_path);
			}
			start += filePathList.length;
			end += filePathList.length;
		};
		pushData();
		conn.on('dataStart', function () {
			if (start < files.length) {
				pushData();
			}
			if (start === files.length) {
				conn.emit('result', result);
			}
		});
	})
	// error catch
	.catch(e => {
		global.echo(chalk.red('Build failed. See below for errors.\n'));
		global.echo(chalk.red(e.stack));
		process.exit(1);
	});
};

const sendDataToClient = (conn, filePath, node_modules_path) => {
	let data = fs.readFileSync(filePath, 'binary'); // 兼容图片等格式
	const tmpArr = filePath.split(node_modules);
	tmpArr[0] = node_modules_path + '/';
	let resPath = tmpArr.join(node_modules);
	conn.emit('data', { path: resPath, data: data });
};

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