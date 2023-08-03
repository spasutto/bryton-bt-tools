# bryton-bt-tools
bryton-bt-tools is a web app to download FIT/GPX files from [Bryton cycle computers](https://www.brytonsport.com/).

**Its currently a "Proof of Concept"** but does the job on my Bryton 310 !

[The tool is available here](https://spasutto.github.io/bryton-bt-tools/bryton.html)

*Note : It'll works on moderns browsers supporting bluetooth ([list here](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility)).*

## Usage
 - [Launch the webpage](https://spasutto.github.io/bryton-bt-tools/bryton.html) from a device supporting bluetooth (hardware+[compatible browser](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility))
 - activate the bluetooth on your device and turn on the cycling computer
 - click on the big power button
 - choose your cycling computer in the BT selection popup
 - wait for the data download
 - click GPX or FIT to download the activity in the desired format

## notes
Supported activity data in GPX export includes :
 - latitude
 - longitude
 - cadence
 - heartrate
