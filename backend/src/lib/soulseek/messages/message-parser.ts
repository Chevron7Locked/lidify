export class MessageParser {
  data: Buffer
  pointer: number

  constructor(data: Buffer) {
    this.data = data
    this.pointer = 0
  }

  int8() {
    if (this.pointer + 1 > this.data.length) {
      throw new Error('Buffer underflow: cannot read int8')
    }
    const value = this.data.readUInt8(this.pointer)
    this.pointer += 1
    return value
  }

  int32() {
    if (this.pointer + 4 > this.data.length) {
      throw new Error('Buffer underflow: cannot read int32')
    }
    const value = this.data.readUInt32LE(this.pointer)
    this.pointer += 4
    return value
  }

  int64() {
    if (this.pointer + 8 > this.data.length) {
      throw new Error('Buffer underflow: cannot read int64')
    }
    const value = this.data.readBigUInt64LE(this.pointer)
    this.pointer += 8
    return value
  }

  str() {
    if (this.pointer + 4 > this.data.length) {
      throw new Error('Buffer underflow: cannot read string length')
    }
    const size = this.data.readUInt32LE(this.pointer)
    this.pointer += 4
    if (this.pointer + size > this.data.length) {
      throw new Error('Buffer underflow: cannot read string data')
    }
    const str = this.data.toString('utf8', this.pointer, this.pointer + size)
    this.pointer += size
    return str
  }

  rawHexStr(size: number) {
    if (this.pointer + size > this.data.length) {
      throw new Error('Buffer underflow: cannot read raw hex string')
    }
    const str = this.data.toString('hex', this.pointer, this.pointer + size)
    this.pointer += size
    return str
  }
}
