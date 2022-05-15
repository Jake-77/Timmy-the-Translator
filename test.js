
const Discord = require('discord.js');
const { MessageEmbed } = require('discord.js');
const ffmpeg = require('ffmpeg');
const fs = require('fs');
var wavConverter = require('wav-converter');
var util = require('util');
var path = require('path');
require('dotenv').config();
const fetch = require('node-fetch');
const axios = require('axios')
const url = 'https://api.assemblyai.com/v2/upload';
const endpoint = "https://api.assemblyai.com/v2/transcript";

const {
	prefix,
    token,
    type
} = require('./config.json');

const client = new Discord.Client({ intents: ['GUILD_VOICE_STATES', 'GUILD_MESSAGES', 'GUILDS'] });
client.login(token);

client.once('ready', () => {
    console.log('Ready!');
   });
   client.once('reconnecting', () => {
    console.log('Reconnecting!');
   });
   client.once('disconnect', () => {
    console.log('Disconnect!');
});

client.on('message', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;
    if (message.content.startsWith(`${prefix}join`)) {
        var connection = join(message);
        return;
    }
    else if (message.content.startsWith(`${prefix}translate`)){
        listen(message);
        return;
    }
    else if (message.content.startsWith(`${prefix}leave`)){
        leave(message);
        return;
    }
    else if (message.content.startsWith(`${prefix}help`)){
        help(message);
        return;
    }
    else{
        message.channel.send("That wasn't a valid command try !help");
    }
})

async function listen (message){
    const args = message.content.split(" ");
    const lang = ['en', 'en_au', 'en_uk', 'en_us', 'fr', 'de', 'it','es'];
    var connection =  await message.member.voice.channel.join();

    if(message.guild.voice.channel && lang.includes(args[1]) && lang.includes(args[2])){
        var user = message.member;
        console.log("starting");
        message.channel.send("I am listening...");
        const audio = connection.receiver.createStream(user, { mode: 'pcm', end: 'silence' });
        const writer = audio.pipe(fs.createWriteStream('./user_audio.pcm'));
    
        writer.on("finish", () => {
            message.channel.send("Heard you! Starting transcription...");
            var pcmData = fs.readFileSync(path.resolve(__dirname, './user_audio.pcm'));
            var wavData = wavConverter.encodeWav(pcmData, {
                numChannels: 1,
                sampleRate: 100000,
                byteRate: 800
            });
            fs.writeFileSync(path.resolve(__dirname, './user_audio.wav'), wavData);


                // Do something with the data returned from python script
                upload(message, args, 'user_audio.wav');
        });
    }
    else{
        message.channel.send("Either your not in a vc or the language is unsupported.");
    }
}
async function leave (message){

    const args = message.content.split(" ");
    const vc = message.member.voice.channel;
    try{
        vc.leave();
    }
    catch (e){
        console.log(e);
        return message.channel.send(e);
    }
}

async function join (message){

    const args = message.content.split(" ");
    const vc = message.member.voice.channel;
    const allowed = vc.permissionsFor(message.client.user);

    if (!allowed.has("CONNECT") || !allowed.has("SPEAK")) {
        return message.channel.send(
          "no no no"
        );
    }
    else{
        try{
            var connection = await vc.join();

        }
        catch (e){
            console.log(e);
            return message.channel.send(err);
        }
    }
    return connection;
}
async function upload(message, args, audioPath){

    fs.readFile(audioPath, (err, data) => {
        if (err) {
          return console.log(err);
        }
      
        const params = {
          headers: {
            "authorization": process.env.ASSEMBLY_AI_API_KEY,
            "Transfer-Encoding": "chunked",
          },
          body: data,
          method: 'POST'
        };
      
        fetch(url, params)
          .then(response => response.json())
          .then(data => {
                transcribe(message, args ,data['upload_url']);
          })
          .catch((error) => {
            console.error(`Error: ${error}`);
          });
      });
}

function transcribe(message, args, tUrl){

    const assembly = axios.create({ baseURL: "https://api.assemblyai.com/v2",
        headers: {
            authorization: process.env.ASSEMBLY_AI_API_KEY,
            "content-type": "application/json",
        },
    });

    const audioURL = tUrl

assembly
    .post("/transcript", {
        audio_url: `${audioURL}`,
        language_code: `${args[1]}`
    })
    .then((res) =>{
        download(message,args, res.data['id'], false);
 
    })
    .catch((err) => console.error(err))

}
function download (message, args, ID, flag){

    if(flag == false){
        const params = {
            headers: {
            "authorization": process.env.ASSEMBLY_AI_API_KEY,
            "content-type": "application/json",
            },
            method: 'GET'
        };
        var newUrl = endpoint + `/${ID}`;
        fetch(newUrl, params)
            .then(response => response.json())
            .then(data => {
                console.log(data.status);
                switch(data.status){
                    case "completed":
                        message.channel.send("**You Said: " + data.text + "**");
                        message.channel.send("Starting translation...");
                        translate(message,data.text,args[2], args[1]);
                        
                        return true
                        
                    default:
                        flag = download(message,args, ID, false);
                }
            })
            .catch((error) => {
                console.error(`Error: ${error}`);
        });
    }
}
  function translate(message,text,target,source)
{
    const encodedParams = new URLSearchParams();
    encodedParams.append("q", text);
    encodedParams.append("target", target);
    encodedParams.append("source", source);

    const options = {
    method: 'POST',
    url: 'https://google-translate1.p.rapidapi.com/language/translate/v2',
    headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'Accept-Encoding': 'application/gzip',
        'X-RapidAPI-Host': 'google-translate1.p.rapidapi.com',
        'X-RapidAPI-Key': process.env.TRANSLATE_API_KEY
    },
    data: encodedParams
    };

    axios.request(options).then(function (response) {
        console.log(response.data.data.translations[0].translatedText);
        tts(message,target, response.data.data.translations[0].translatedText.replaceAll('&#39;', "'"));
    }).catch(function (error) {
        console.error(error);
    });
}
async function tts(message,target, text){

    const encodedParams = new URLSearchParams();
    if(target == 'en'){
        var newTarget = target + '-CA-1';
    }
    else if(target == 'es'){
        var newTarget = target + '-ES-1';
    }
    else if (target == 'it'){
        var newTarget = target + '-IT-1';
    }
    else if (target == 'fr'){
        var newTarget = target + '-FR-1';
    }
    else{
        var newTarget = target + '-DE-1';
    }
    encodedParams.append("voice_code", newTarget);
    encodedParams.append("text", text);
    encodedParams.append("speed", "1.00");
    encodedParams.append("pitch", "1.00");
    encodedParams.append("output_type", "audio_url");
    
    const options = {
      method: 'POST',
      url: 'https://cloudlabs-text-to-speech.p.rapidapi.com/synthesize',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'X-RapidAPI-Host': 'cloudlabs-text-to-speech.p.rapidapi.com',
        'X-RapidAPI-Key': process.env.RAPID_API_KEY
      },
      data: encodedParams
    };
    var VC = message.member.voice.channel;
    axios.request(options).then(function (response) {
        VC.join()
            .then(connection => {
                const dispatcher = connection.play(response.data.result.audio_url);
                message.channel.send('**Translation: ' + text + '**');
                dispatcher.on("end", end => {VC.leave()});
            })
        .catch(console.error);
    }).catch(function (error) {
        console.error(error);
    }); 

}
function help(message){
    message.channel.send(new MessageEmbed()
    .setColor('#0099ff')
    .setTitle('help')
    .setURL('https://discord.js.org/%27')
    //.setAuthor({ name: 'Uzaki bot', iconURL: 'https://i.imgur.com/AfFp7pu.png', url: 'https://discord.js.org/' })
    .setDescription(`Hello, I am Uzaki bot! 
    \n\n**__Commands__**
    \n**!join**: join you in a voice channel
    \n**!translate <starting language code> <translate language code>**: begin listening and translating speech using codes')
    \n**!leave**: leave voice channel
    \n**!help**: get info on bot functionality (basically this message)
    \n\n**__Language Codes__**
    \n*en*: English :flag_us:
    \n*fr*: French :flag_fr:
    \n*it*: Italian :flag_it:
    \n*es*: Spanish :flag_es:
    \n*de*: German :flag_de: `)
    
    .setThumbnail('https://i.imgur.com/AfFp7pu.png')
    
    )
}
