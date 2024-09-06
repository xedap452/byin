const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ByinAPIClient {
    constructor() {
        this.headers = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "Content-Type": "application/json",
            "Origin": "https://byin.fun",
            "Referer": "https://byin.fun/influence",
            "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        };
        this.proxyList = fs.readFileSync('proxy.txt', 'utf8').split('\n').filter(Boolean);
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`);
                break;        
            case 'error':
                console.log(`[${timestamp}] [!] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${msg}`.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Chờ ${i} giây để tiếp tục vòng lặp =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.log('', 'info');
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', { httpsAgent: proxyAgent });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error khi kiểm tra IP của proxy: ${error.message}`);
        }
    }

    async makeRequest(method, url, data = {}, token = null) {
        const headers = token ? { ...this.headers, "Token": token } : this.headers;
        const proxy = this.proxyList[this.currentProxyIndex];
        const httpsAgent = new HttpsProxyAgent(proxy);

        try {
            const response = await axios({
                method,
                url,
                data,
                headers,
                httpsAgent
            });
            return response;
        } catch (error) {
            throw new Error(`Request failed: ${error.message}`);
        }
    }

    async login(initData) {
        const url = "https://byin.fun/api/tg/login";
        const payload = {
            initData: initData,
            id: JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0])).id,
            hash: initData.split('hash=')[1],
            username: JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0])).username,
            authDate: Math.floor(Date.now() / 1000),
            firstName: JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0])).first_name,
            lastName: JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0])).last_name,
            photoUrl: "",
            isPremium: "",
            inviteCode: ""
        };

        try {
            const response = await this.makeRequest('post', url, payload);
            if (response.status === 200 && response.data.code === 0) {
                return { 
                    success: true, 
                    token: response.data.data.token,
                    isNew: response.data.data.isNew
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async receiveCurrency(token) {
        const url = "https://byin.fun/api/currency/receive";
        try {
            const response = await this.makeRequest('post', url, {}, token);
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, data: response.data.data };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getAccountInfo(token) {
        const url = "https://byin.fun/api/account";
        try {
            const response = await this.makeRequest('get', url, {}, token);
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, data: response.data.data };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getAndCompleteTasksForUser(token) {
        const taskTypes = [0, 1, 2];
        const joinTaskUrl = "https://byin.fun/api/task/join";

        for (const taskType of taskTypes) {
            const tasksUrl = `https://byin.fun/api/task/page?taskType=${taskType}&pageSize=10000&pageNum=1`;

            try {
                this.log(`Đang lấy danh sách nhiệm vụ loại ${taskType}...`, 'info');
                const tasksResponse = await this.makeRequest('get', tasksUrl, {}, token);
                if (tasksResponse.status !== 200 || tasksResponse.data.code !== 0) {
                    throw new Error(`Failed to get tasks for type ${taskType}: ${tasksResponse.data.msg}`);
                }

                const unfinishedTasks = tasksResponse.data.data.list.filter(task => !task.hasFinish);
                this.log(`Tìm thấy ${unfinishedTasks.length} nhiệm vụ chưa hoàn thành cho loại ${taskType}.`, 'info');

                for (const task of unfinishedTasks) {
                    try {
                        const joinResponse = await this.makeRequest('post', joinTaskUrl, { id: task.id }, token);
                        if (joinResponse.status === 200 && joinResponse.data.code === 0) {
                            this.log(`Làm nhiệm vụ ${task.taskName.yellow} (Loại ${taskType}) thành công | Phần thưởng: ${task.reward.toString().magenta}`, 'custom');
                        } else {
                            this.log(`Làm nhiệm vụ ${task.taskName} (Loại ${taskType}) thất bại: ${joinResponse.data.msg}`, 'error');
                        }
                    } catch (error) {
                        this.log(`Lỗi khi thực hiện nhiệm vụ ${task.taskName} (Loại ${taskType}): ${error.message}`, 'error');
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                this.log(`Đã hoàn thành tất cả các nhiệm vụ chưa hoàn thành cho loại ${taskType}.`, 'success');
            } catch (error) {
                this.log(`Lỗi khi lấy hoặc hoàn thành nhiệm vụ loại ${taskType}: ${error.message}`, 'error');
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        this.log(`Đã hoàn thành tất cả các loại nhiệm vụ.`, 'success');
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        while (true) {
            for (let i = 0; i < data.length; i++) {
                this.currentProxyIndex = i % this.proxyList.length;
                const initData = data[i];
                const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
                const userId = userData.id;
                const firstName = userData.first_name;

                let proxyIP = "Unknown";
                try {
                    proxyIP = await this.checkProxyIP(this.proxyList[this.currentProxyIndex]);
                } catch (error) {
                    this.log(`Không thể kiểm tra IP của proxy: ${error.message}`, 'warning');
                }

                console.log(`========== Tài khoản ${i + 1} | ${firstName.green} | IP: ${proxyIP} ==========`);
                
                this.log(`Đang đăng nhập tài khoản ${userId}...`, 'info');
                const loginResult = await this.login(initData);
                if (loginResult.success) {
                    this.log('Đăng nhập thành công!', 'success');
                    const token = loginResult.token;
                    
                    if (loginResult.isNew === 1) {
                        const receiveResult = await this.receiveCurrency(token);
                        if (receiveResult.success) {
                            this.log(`Nhận currency thành công!`, 'success');
                        } else {
                            this.log(`Không thể nhận currency: ${receiveResult.error}`, 'error');
                        }
                    } else {
                        this.log(`Tài khoản không phải mới, bỏ qua nhận currency.`, 'info');
                    }

                    const accountInfoResult = await this.getAccountInfo(token);
                    if (accountInfoResult.success) {
                        this.log(`Balance: ${accountInfoResult.data.totalQuantity}`, 'info');
                    } else {
                        this.log(`Không thể lấy thông tin tài khoản: ${accountInfoResult.error}`, 'error');
                    }

                    await this.getAndCompleteTasksForUser(token);
                } else {
                    this.log(`Đăng nhập không thành công! ${loginResult.error}`, 'error');
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            await this.countdown(1440 * 60);
        }
    }
}

const client = new ByinAPIClient();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});