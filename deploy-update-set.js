require('dotenv').config();
var puppeteer = require('puppeteer');

var fs = require('fs-extra');
var Promise = require('bluebird');


const deploy = function (host) {

    const filePath = process.env.DEPLOY_FILE;

    const f = filePath.split('/');


    console.log("Deploying file ", filePath)

    var formData = {
        sysparm_ck: '',
        sysparm_upload_prefix: '',
        sysparm_referring_url: 'sys_remote_update_set_list.do?sysparm_fixed_query=sys_class_name=sys_remote_update_set',
        sysparm_target: 'sys_remote_update_set',
        attachFile: {
            value: fs.createReadStream(__dirname + filePath),
            options: {
                filename: `${f[f.length - 1].split('.')[0]}.xml`,
                contentType: 'text/xml'
            }
        }
    };
    var url = `https://${host}.service-now.com`;//sys_remote_update_set_list.do?sysparm_query=sys_class_name%3Dsys_remote_update_set%5EstateINloaded%2Cpreviewed`;

    var request = require('request-promise');
    var j = request.jar()
    request = request.defaults({
        jar: j,
        strictSSL: false,
        proxy: process.env.PROXY,
        baseUrl: url
    });

    return request({
        url: '/api/now/table/sys_user/1',
        auth: {
            username: process.env.DEPLOY_USER_NAME,
            password: process.env.DEPLOY_USER_PASSWORD
        }
    }).catch(() => {
        //console.log(j);
    }).then(() => {
        return request({
            url: '/upload.do'
        }).then((res) => {
            const m = res.match(/['"](\w{72})['"]/);
            if (m) {
                formData.sysparm_ck = m[1];
            }
        });
    }).then(() => {

        //console.log(formData);
        console.log(`deploy to ${host}`)
        //console.log(formData);

        //return 'disabled';

        return request.post({
            url: '/sys_upload.do',
            formData: formData,
            //rawResponse: true,
            //resolveWithFullResponse: true,
            followRedirect: false
        })

        //
    }).then((r) => {
        console.log(Object.keys(r));

        return { url };
    }).catch((e) => {

        //console.log(e.response);
        if (e.statusCode == 302) {
            console.log(`deployment done on ${host}`)

            return { url };
        }

        console.log(`error on ${host}`, e)
        return `ERROR ON https://${host}.service-now.com/sys_remote_update_set_list.do?sysparm_query=sys_class_name%3Dsys_remote_update_set%5EstateINloaded%2Cpreviewed%5EnameSTARTSWITHCICD%20Integration%20-%201.4`

    });

}

const commitManually = function (hosts) {

    const username = process.env.DEPLOY_USER_NAME
    const password = process.env.DEPLOY_USER_PASSWORD

    return puppeteer.launch({
        ignoreHTTPSErrors: true,
        headless: false,
    }).then((browser) => {

        return Promise.mapSeries(hosts, (({ url }) => {

            return browser.newPage().then((page) => {
                return Promise.try(() => {
                    return page.setViewport({
                        width: 1800,
                        height: 1000
                    });
                }).then(() => {
                    return page.setExtraHTTPHeaders({
                        'Authorization': 'Basic '.concat(Buffer.from(`${username}:${password}`).toString('base64'))
                    });
                }).then(() => {
                    // get a session cookie without being redirected to SAML endpoint
                    return page.goto(`${url}/api/now/table/sys_user/0`, {
                        waitUntil: 'networkidle2'
                    });
                }).then(() => {
                    return page.goto(`${url}/login.do?user_name=${username}&sys_action=sysverb_login&user_password=${password}`, {
                        waitUntil: 'networkidle2'
                    });
                }).then(() => {
                    //page.close();
                    return page.goto(`${url}/nav_to.do?uri=sys_remote_update_set_list.do%3Fsysparm_query%3Dsys_class_name%3Dsys_remote_update_set%5EstateINloaded%2Cpreviewed%5EnameSTARTSWITHCICD%20Integration%20-%201.4`, {
                        waitUntil: 'networkidle2',
                        timeout: 0
                    });
                });
            });
        }));

    });
}

Promise.mapSeries((process.env.DEPLOY_TO || '').split(','), (host) => {
    return deploy(host.trim());
}).then((res) => {
    console.log('all deployments done');
    return commitManually(res);

});
