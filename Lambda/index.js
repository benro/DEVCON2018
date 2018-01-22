const serverless = require('serverless-http');

var express = require('express');
var bodyParser = require('body-parser');
const app = express()
var port = 8923;

app.use(bodyParser.json());

app.listen(port, function () {
    console.log('App listening on port ' + port)
})

app.get('/catch', function (req, res) {
    res.send('Hello World')
    console.log(req.body);
})

app.post('/catch', function (request, response) {
    // console.log(request.body);      // your JSON
    var jira = {};
    parseJiraPayload(jira, request);
    if (jira.resolution == "Done") {
    console.log("Issue is marked as Done - kick off the process.")
    getAttachmentUrls(jira, request);
    generateJiraArchiveProcess(jira, downloadAttachments);
     } else {
         console.log("It doesnt look like this issue is makred as Done yet.")
     }
})


var http = require('http');
var activitiHost = ""; //Activiti host
var activitiPort = "9090"; //Activiti port
var tenant = "tenant_1";
var userId = ""; //Activiti userId
var password = ""; //Activiti password
var baseActivitiUrl = "http://" + userId + ":" + password + "@" + activitiHost + ":" + activitiPort + "/activiti-app/api/"
var versionUrl = "http://" + userId + ":" + password + "@" + activitiHost + ":" + activitiPort + "/activiti-app/api/enterprise/app-version";
var startProcessUrl = baseActivitiUrl + "enterprise/process-instances";
var processDefinitionKey = "JiraArchive"
var processUploadUrl1 = baseActivitiUrl + "enterprise/process-instances/"

function parseJiraPayload(jira, request) {
    jira.webhookEvent = request.body.webhookEvent;
    jira.id = request.body.issue.id;
    jira.link = request.body.issue.self;
    jira.userDisplayName = request.body.user.displayName;
    jira.description = request.body.issue.fields.description;
    jira.projectName = request.body.issue.fields.project.name;
    jira.projectLink = request.body.issue.fields.project.self;
    jira.projectID = request.body.issue.fields.project.id;
    jira.creatorDisplayName = request.body.issue.fields.creator.displayName;
    jira.created = request.body.issue.fields.created;
    jira.resolution = null;
    if (request.body.issue.fields.resolution) {
        jira.resolution = request.body.issue.fields.resolution.name || null;
    }
}

function getAttachmentUrls(jira, request) {
    var _ = require('underscore');
    jira.Attachments = _.map(request.body.issue.fields.attachment, function (a) {
        return '/' + a.id + '/' + a.filename;
    });
}

function uploadFile(processInstanceId, filename) {

    var newUrl = processUploadUrl1 + processInstanceId + "/raw-content"
    var request = require("request");
    var fs = require('fs');
    var req = request.post(newUrl, function (err, resp, body) {
        if (err) {
            console.log('Error - Upload to Activiti' + filename + ' ' + err);
        } else {
            var response = JSON.parse(body);
            console.log("Upload to Activiti Complete " + response.name + ' status code ' + resp.statusCode);
        }
    });

    var form = req.form();
    form.append('file', fs.createReadStream("/tmp/" + filename));
    form.append('name', filename)
};

var download = function (url, dest, callback) {
    var jiraHost = '';  //Jira Host
    var jiraBaseUrl = '@' + jiraHost + '/secure/attachment';
    var jiraUserName = '';  //Jira userId
    var jiraPassword = '';  //Jira Password

    var request = require("request");

    var baseRequest = request.defaults({
        baseUrl: 'https://' + jiraUserName + ':' + jiraPassword + jiraBaseUrl
    });

    var fs = require('fs');
    baseRequest.get(url)
        .on('error', function (err) { console.log(err) })
        .pipe(fs.createWriteStream("/tmp/" + dest))
        .on('close', callback);
};


function downloadAttachments(processInstanceId, urlList) {
    urlList.forEach(function (str) {
        var filename = str.split('/').pop();
        console.log('Downloading ' + filename);
        var postUrl = processUploadUrl1 + processInstanceId + "/raw-content"

        download(str, filename, function () {
            console.log('Finished Downloading' + filename);
            uploadFile(processInstanceId, filename)
        });
    });
}

function generateJiraArchiveProcess(jira, callback) {
    console.log("generateJiraArchiveProcess");
    var request = require("request");
    var reqObj = {
        "values":
            {
                "jiraId": jira.id,
                "jiraProjectName": jira.projectName,
                "jiraDescription": jira.description,
                "jiraIssueLink": jira.link,
                "jiraCreatorDisplayName": jira.creatorDisplayName,
                "jiraCreated": jira.created
            },
        "processDefinitionKey": processDefinitionKey,
        "name": "Jira Archive " + jira.id
    }

    body = JSON.stringify(reqObj)
    request({
        url: startProcessUrl,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8'
        },
        body: body
    }, function (error, response, body) {
        if (error) {
            console.log(error);
        }
        else {
            var processInstanceId = JSON.parse(body)
            console.log("New ProcessInstance ID: " + processInstanceId.id)
            callback(processInstanceId.id, jira.Attachments);
        }
    });
}

module.exports.handler = serverless(app);