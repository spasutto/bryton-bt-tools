
const SERVICE_COMMAND_AND_DATA = '454d7788-a122-058d-9b42-9d0f3772af82';
const COMMAND_CHANNEL_UUID = '454d2288-a122-058d-9b42-9d0f3772af82';
const DATA_CHANNEL_UUID = '454d1188-a122-058d-9b42-9d0f3772af82';

class BrytonBTTool {
  #connected = false;
  #curstep = '';
  constructor(onlog=null) {
    this.cmdSeqNo = 0;
    this.device = null;
    this.service = null;
    this.cmdCharacteristic = null;
    this.dataCharacteristic = null;

    this.dataPayload = 18;
    this.onChangeDataCrcCount = 0;
    this.nowOnChangeDataCommandId = 0;
    this.onChangeDataByteList = [];
    this.onChangeDataMap = [];
    this.flowCtrl = 10; // à changer?
    
    //this.onfilelistreceived = typeof onfilelistreceived === 'function' ? onfilelistreceived : null;

    this.log = typeof onlog === 'function' ? onlog : (msg) => {console.log(msg);};
    //this.error = function(/*dynamic arguments*/) {console.log(...arguments);};
  }

  get connected() {
    return this.#connected;
  }
  set connected(value) {
    this.#connected = !!value;
    if (typeof this.onconnectionchanged === 'function') this.onconnectionchanged(this.#connected);
  }
  get curstep() {
    return this.#curstep;
  }
  set curstep(value) {
    this.#curstep = value;
    if (typeof this.onstepchanged === 'function') this.onstepchanged(this.#curstep);
  }

  error() {
    if (typeof this.onerror === 'function') this.onerror(...arguments);
  }

  connect() {
    try {
      this.curstep='connecting';
      navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_COMMAND_AND_DATA] // Required to access service later.
      })
      .then(d => {
        this.device = d;
        this.device.addEventListener('gattserverdisconnected', this.internalconnect.bind(this));
        this.internalconnect();
      })
      .catch(error => {
        this.error(error);
      });
    } catch(error) {
      this.error(error);
    }
  }

  disconnect() {
    this.connected = false;
    try {
      let hdlrs = [this.handleCmdCharacteristicValueChanged, this.handleDataCharacteristicValueChanged];
      [this.cmdCharacteristic, this.dataCharacteristic].forEach((c, i) => {
        if (c) {
          c.stopNotifications()
          .then(_ => {
            this.log('> Notifications stopped for cmdCharacteristic ' + (i+1));
            c.removeEventListener('characteristicvaluechanged',
                hdlrs[i]);
          })
          .catch(error => {
            //this.error(error);
          });
        }
      });
      this.device.gatt.disconnect();
    } catch(e) {}
    this.log('disconnected.');
  }
  internalconnect() {
    this.connected = false;
    this.curstep='connecting';
    try {
      this.device.gatt.connect().then(server => {
        return server.getPrimaryService(SERVICE_COMMAND_AND_DATA);
      })
      .then(s => {
        this.service = s;
        return this.service.getCharacteristic(DATA_CHANNEL_UUID);
      })
      .then(c => {
        this.dataCharacteristic = c;
        return c.startNotifications().then(_ => {
          this.dataCharacteristic.addEventListener('characteristicvaluechanged', this.handleDataCharacteristicValueChanged.bind(this));
        });
      })
      .then(s => {
        return this.service.getCharacteristic(COMMAND_CHANNEL_UUID);
      })
      .then(c => {
        this.cmdCharacteristic = c;
        return c.startNotifications().then(_ => {
          //this.log('> Notifications started for cmdCharacteristic');
          this.cmdCharacteristic.addEventListener('characteristicvaluechanged', this.handleCmdCharacteristicValueChanged.bind(this));
        });
      })
      .then(_ => {
        return this.readDeviceInfo();
      })
      .then(_ => {
        return this.getFileList();
      }).then(_=> {
        this.connected = true;
      })
      .catch(error => {
        this.error(error);
      });
    } catch(error) {
      this.error(error);
    }
  }
  
  writeToCmd(data) {
    //log('Writing to cmdCharacteristic.');
    this.cmdCharacteristic.writeValue(data)
    .then(_ => {
      //this.log('Command Characteristic has been written ('+data.map(this.toHexString).join(' ')+')');
    })
    .catch(error => {
      this.error(error);
    });
  }
  progressCmdSeq() {
    this.cmdSeqNo++;
    if (this.cmdSeqNo % 8 == 0) this.cmdSeqNo = 0;
  }
  readDeviceInfo() {
    this.log("getting device infos...");
    this.curstep='getting device infos';
    this.progressCmdSeq();
    let data = this.requestDataCmd(6);//readDeviceInfo
    return new Promise((resolve, reject) => {
      this.readDeviceInfoPromise = resolve;
      // TODO reject
      this.writeToCmd(data);
    });
  }
  getFileList() {
    this.log("getting file list...");
    this.curstep = "getting file list...";
    this.progressCmdSeq();
    let data = this.requestDataCmd(11);//getfilelist
    return new Promise((resolve, reject) => {
      this.getFileListPromise = resolve;
      // TODO reject
      this.writeToCmd(data);
    });
  }
  getFile(fileId) {
    if (!this.filelist || !Array.isArray(this.filelist.result)) {
      this.error('Get file list first!');
      return;
    }
    if (typeof fileId !== 'number' || fileId <= 0) fileId = this.filelist.result[0].fileId;
    if (!this.filelist.result.some(f => f.fileId == fileId)) {
      this.error('Unknown file!');
      return;
    }
    this.log("getting file "+fileId+"...");
    this.curstep = "getting file "+fileId+"...";
    this.progressCmdSeq();
    let data = this.requestDataCmd(12, 1, fileId);//getfilelist
    return new Promise((res, reject) => {
      this.getFilePromise = resolve;
      // TODO rej
      this.writeToCmd(data);
    });
  }
  handleCmdCharacteristicValueChanged(event) {
    try {
      const value = event.target.value;
      let unsignedByte = value.getUint8(0);
      let unsignedByte1 = value.getUint8(1);
      let intValue = this.getBitByByte(unsignedByte1, 0, 2);
      let intValue2 = this.getBitByByte(unsignedByte1, 3, 5);
      let intValue3 = this.getBitByByte(unsignedByte1, 6, 7);
      let unsignedByte2 = value.getUint8(2);
      if (unsignedByte == 6 || unsignedByte == 11 || unsignedByte == 15) {
        let bArr = this.generateActionData(unsignedByte, intValue2, 3);
        this.writeToCmd(bArr);
      } else if (unsignedByte == 12 || unsignedByte == 16 || unsignedByte == 17) {
        let bArr = this.generateActionData(unsignedByte, intValue2, 5);
        this.writeToCmd(bArr);
      } else {
        throw new Error('TODO implement?');
      }
    } catch(error) {
      this.error('Command characteristic receive error ! ' + error);
    }
  }
  handleDataCharacteristicValueChanged(event) {
    try {
      const value = event.target.value;
      let intValue = value.getInt16(0); // 0 1
      if (intValue == 0) {
        this.onChangeDataCrcCount = 0;
        this.onChangeDataFragNum = value.getInt16(2); // 2 3
        this.onChangeDataLastFragSize = value.getUint8(4); // 4
        let unsignedByte = value.getUint8(5); // 5
        this.nowOnChangeDataCommandId = unsignedByte;
        this.onChangeDataByteList = [];
        this.onChangeDataMap = [];
        this.receiveDataSizeCount = 0;
        this.fileRangeReceiveDataSizeCount = 0;//TODO à virer / déplacer
        if (this.onChangeDataFragNum <= 0) {
          // TODO
          if (unsignedByte == 15) {
            this.log('ACTION_REQUEST_DATA');
          } else {
            this.log('ACTION_EMPTY_DATA');
          }
        } else if (unsignedByte == 6) {
          let i = ((this.onChangeDataFragNum - 1) * this.dataPayload) + this.onChangeDataLastFragSize;
          this.onChangeDataByteArray = new Array(i);
          this.onChangeDataTotalSize = i;
        } else if (unsignedByte == 11) {
          let intValue2 = value.getUint16(7);
          let i2 = this.dataPayload;
          this.onChangeDataByteArray = new Array(i2 * 2 * intValue2);
          this.onChangeDataTotalSize = intValue2 * i2 * 2;
        } else if (unsignedByte == 12) {
          let i4 = ((this.onChangeDataFragNum - 1) * this.dataPayload) + this.onChangeDataLastFragSize;
          this.onChangeDataByteArray = new Array(i4);
          this.onChangeDataTotalSize = i4;
        }
      } else if (intValue > this.onChangeDataFragNum) {
        if (value.byteLength != 7) {
          this.log('ACTION_EMPTY_DATA'); //TODO?
          return;
        }
        if (value.getInt32(3) != this.onChangeDataCrcCount) {
          let i8 = this.nowOnChangeDataCommandId;
          if (i8 == 17) {
            // TODO
          }
          this.error('CRC ERROR');
          return;
        }
        this.onChangeDataByteList = [];
        this.onChangeDataMap.forEach((valeur,clef) => {
          for (let i10=2; i10<valeur.byteLength; i10++) {
            this.onChangeDataByteList.push(valeur.getUint8(i10));
          }
        });
        // TODO virer ce tableau inutile?
        this.onChangeDataByteArray = new Array(this.onChangeDataByteList.length);
        for (let i11 = 0; i11 < this.onChangeDataByteList.length; i11++) {
          this.onChangeDataByteArray[i11] = this.onChangeDataByteList[i11];
        }
        this.onChangeDataTotalSize = 0;
        this.onChangeDataByteList = [];
        let i12 = this.nowOnChangeDataCommandId;
        if (i12 == 6) {
          this.DeviceInfos = this.readDeviceInfoFormat(this.onChangeDataByteArray);
          this.log(JSON.stringify(this.DeviceInfos));
          if (typeof this.readDeviceInfoPromise === 'function') this.readDeviceInfoPromise(this.DeviceInfos);
        } else if (i12 == 11) {
          this.filelist = this.getFileListResult(this.onChangeDataByteArray);
          //this.updateFileList(this.filelist);
          if (typeof this.getFileListPromise === 'function') this.getFileListPromise(this.filelist);
          if (typeof this.onfilelistreceived === 'function') this.onfilelistreceived(this.filelist);
        } else if (i12 == 12) {
          //let file = btoa(this.onChangeDataByteArray);
          //this.log("file result :");
          //this.log(JSON.stringify(file));
          let bytes = new Uint8Array(this.onChangeDataByteArray);
          if (typeof this.getFilePromise === 'function') this.getFilePromise(bytes);
          if (typeof this.onfilereceived === 'function') this.onfilereceived(bytes);
        }
      } else {
        for (let i15 = 2; i15 < value.byteLength; i15++) {
          this.onChangeDataCrcCount += value.getUint8(i15);
          let i16 = this.nowOnChangeDataCommandId;
          if (i16 == 6 || i16 == 11 || i16 == 12 || i16 == 15 || i16 == 17) {
            try {
              this.onChangeDataByteList.push(value.getInt8(i15));
            } catch (e) {}
          }
        }
        this.onChangeDataMap[intValue] = value;
        this.receiveDataSizeCount += (value.byteLength-2);
        this.fileRangeReceiveDataSizeCount += (value.byteLength-2);
        let i17 = this.nowOnChangeDataCommandId;
        if (i17 == 12) {
          let i18 = this.flowCtrl;
          if (intValue % i18 == i18 - 1) {
            this.checkGetLogFileContinue();
            return;
          }
        }
        if (i17 == 17) {
          let i19 = this.flowCtrl;
          if (intValue % i19 == i19 - 1) {
            this.checkGetFileRangeContinue();
          }
        }
      }
      if (typeof this.onprogress === 'function' && this.receiveDataSizeCount<=this.onChangeDataTotalSize) this.onprogress(Math.round(100*this.receiveDataSizeCount/this.onChangeDataTotalSize));
    } catch(error) {
      this.error('Data characteristic receive error ! ' + error);
    }
  }
  readDeviceInfoFormat(data) {
    let devinfos = {};
    let dsplit = this.split(data, 0);
    for (let i=0; i<dsplit.length; i++) {
      let str2 = String.fromCharCode(...dsplit[i]);
      let prefix = str2.substring(0, 2);
      if (prefix == "UD" || prefix == "IV" || prefix == "MN" || prefix == "CP") {
        devinfos[prefix] = str2.substring(2);
      }
    }
    return devinfos;
  }
  getFileListResult(data) {
    let filelist = [];
    let length = data.length / 36;
    let i = 0;
    while (i < length) {
      let curfile = {};
      let i2 = i * 36;
      let byte2Int = data[i2];
      let bArr = [];
      for (let i3 = 0; i3 < 4; i3++) {
        bArr[i3] = data[i2 + i3 + 1];
      }
      let intValue = this.fourBytesToInt(bArr);
      let timestamp = (bArr[3]<<24) + (bArr[2]<<16) + (bArr[1]<<8) + bArr[0];
      let date = (new Date(timestamp * 1000)).toLocaleString('fr-FR');
      for (let i4 = 0; i4 < 4; i4++) {
          bArr[i4] = data[i2 + i4 + 5];
      }
      let intValue2 = this.fourBytesToInt(bArr);
      for (let i5 = 0; i5 < 4; i5++) {
          bArr[i5] = data[i2 + i5 + 9];
      }
      let intValue3 = this.fourBytesToInt(bArr);
      let byte2Int2 = data[13];
      for (let i6 = 0; i6 < 4; i6++) {
          bArr[i6] = data[i2 + i6 + 14];
      }
      let intValue4 = this.fourBytesToInt(bArr);
      let byte2Int3 = data[i2 + 18];
      /*let i7 = length;
      for (let i8 = 0; i8 < 17; i8++) {
          bArr[i8] = data[i2 + i8 + 19];
      }
      new BigInteger(bArr5).intValue();*/
      curfile['activityDist'] = intValue3;
      curfile['activityTime'] = intValue2;
      curfile['fileId'] = intValue;
      curfile['isWorkout'] = byte2Int2;
      curfile['sportType'] = byte2Int3;
      curfile['workoutId'] = intValue4;
      curfile['fileIdToTimeStamp'] = date;
      curfile['payloadSize'] = byte2Int;
      filelist.push(curfile);
      i++;
    }
    return {'extra': length, 'result': filelist};
  }
  requestDataCmd(cmdId, fileType, fileId, offset, chunkSize, userAddress) {
    fileType = typeof fileType === 'number' ? fileType : 0;
    fileId = typeof fileId === 'number' ? fileId : 0;
    offset = typeof offset === 'number' ? offset : 0;
    chunkSize = typeof chunkSize === 'number' ? chunkSize : 0;
    userAddress = typeof userAddress === 'string' ? userAddress : "";
    
    let bArr = null;
    switch (cmdId) {
      case 8:
        bArr = new Uint8Array(10);
        break;
      case 12:
        bArr = new Uint8Array(7);
        break;
      case 15:
      case 16:
        bArr = new Uint8Array(3);
        break;
      case 17:
        bArr = new Uint8Array(15);
        break;
      default:
        bArr = new Uint8Array(2);
        break;
    }
    bArr[0] = cmdId;
    let binString = this.intToBinaryString(this.cmdSeqNo, 3);
    bArr[1] = parseInt('000'+binString+'00', 2);
    switch (cmdId) {
      case 8:
        for (let i=0; i<Math.min(userAddress.length, bArr.length); i++) {
          bArr[i+2] = userAddress.charCodeAt(i);
        }
        break;
      case 15:
      case 16:
        bArr[2] = fileType;
        break;
      case 12:
        let fitFileName = this.toBytesInt32(fileId);// fitFileNameToByteArray(fileId);
        bArr[2] = fitFileName[0];
        bArr[3] = fitFileName[1];
        bArr[4] = fitFileName[2];
        bArr[5] = fitFileName[3];
        bArr[6] = fileType;
      case 17:
        //TODO
        break;
      default:
        break;
    }
    return bArr;
  }
  generateActionData(cmdId, seqNo, actionCode) {
    let bArr = actionCode == 5 ? new Uint8Array(5) : new Uint8Array(3);
    bArr[0] = cmdId;
    bArr[1] = parseInt("010" + this.intToBinaryString(seqNo, 3) + "00", 2);
    bArr[2] = actionCode;
    if (actionCode == 5) {
      let tmp = this.intToBinaryString(this.flowCtrl, 16);
      bArr[3] = parseInt(tmp.substring(0, 8), 2)
      bArr[4] = parseInt(tmp.substring(8, 16), 2);
    }
    return bArr;
  }
  checkGetLogFileContinue() {
    let bArr = this.generateActionData(12, this.cmdSeqNo, 6);
    this.writeToCmd(bArr);
  }
  checkGetFileRangeContinue() {
    let bArr = this.generateActionData(17, this.cmdSeqNo, 6);
    this.writeToCmd(bArr);
  }
  
  fourBytesToInt(data) {
    let u8 = new Uint8Array(data.reverse()); // original array
    let u32bytes = u8.buffer; // four bytes as a new `ArrayBuffer`
    return new Int32Array(u32bytes)[0];
  }
  intTofourBytes(number) {
    const buffer = new ArrayBuffer(4);
    let dataview = new DataView(buffer);
    dataview.setInt32(0, number, false /* littleEndian */);
    return new Uint8Array(buffer);
  }
  split(array, value) {
    let arrayList = [];
    let arrayList2 = [];
    array.forEach(b => {
      if (b == value && arrayList2.length > 0) {
        arrayList.push(arrayList2);
        arrayList2 = [];
      } else if (b != value) {
        arrayList2.push(b);
      }
    });
    if (arrayList2.length > 0) {
      arrayList.push(arrayList2);
    }
    return arrayList;
  }
  intToBinaryString(value, nob, sep) {
    nob = typeof nob === 'number' && nob > 0 ? nob : 8;
    sep = typeof sep === 'number' ? sep : -1;
    let binaryStr = value.toString(2);
    while(binaryStr.length < nob) {
      binaryStr = "0" + binaryStr;
    }
    if (sep > 0)
    for (let i=binaryStr.length-sep; i>=0; i-=sep) {
      binaryStr = binaryStr.slice(0, i) + " " + binaryStr.slice(i);
    }
    return binaryStr.trim();
  }
  toHexString(nbr) {
    return (nbr<16?'0':'')+nbr.toString(16).toUpperCase();
  }
  getBitByByte(b ,begIndex, endIndex) {
    return parseInt(this.intToBinaryString(b).substring(begIndex, endIndex + 1), 2);
  }
  toBytesInt32(num) {
      let arr = new ArrayBuffer(4); // an Int32 takes 4 bytes
      let view = new DataView(arr);
      view.setUint32(0, num, false); // byteOffset = 0; litteEndian = false
      return new Uint8Array(arr);
  }
}
