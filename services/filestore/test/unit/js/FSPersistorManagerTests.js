const sinon = require('sinon')
const chai = require('chai')
const { expect } = chai
const SandboxedModule = require('sandboxed-module')
const Errors = require('../../../app/js/Errors')

chai.use(require('sinon-chai'))
chai.use(require('chai-as-promised'))

const modulePath = '../../../app/js/FSPersistorManager.js'

describe('FSPersistorManagerTests', function() {
  const stat = { size: 4 }
  const fd = 1234
  const readStream = 'readStream'
  const writeStream = 'writeStream'
  const remoteStream = 'remoteStream'
  const tempFile = '/tmp/potato.txt'
  const location = '/foo'
  const error = new Error('guru meditation error')

  const files = ['wombat.txt', 'potato.tex']
  let fs, rimraf, stream, LocalFileWriter, FSPersistorManager

  beforeEach(function() {
    fs = {
      createReadStream: sinon.stub().returns(readStream),
      createWriteStream: sinon.stub().returns(writeStream),
      unlink: sinon.stub().yields(),
      open: sinon.stub().yields(null, fd),
      readdir: sinon.stub().yields(null, files),
      stat: sinon.stub().yields(null, stat)
    }
    rimraf = sinon.stub().yields()
    stream = { pipeline: sinon.stub().yields() }
    LocalFileWriter = {
      promises: {
        writeStream: sinon.stub().resolves(tempFile),
        deleteFile: sinon.stub().resolves()
      }
    }
    FSPersistorManager = SandboxedModule.require(modulePath, {
      requires: {
        './LocalFileWriter': LocalFileWriter,
        fs: fs,
        'logger-sharelatex': {
          log() {},
          err() {}
        },
        rimraf: rimraf,
        stream: stream,
        './Errors': Errors
      },
      globals: { console }
    })
  })

  describe('sendFile', function() {
    it('should copy the file', async function() {
      await FSPersistorManager.promises.sendFile(location, files[0], files[1])
      expect(fs.createReadStream).to.have.been.calledWith(files[1])
      expect(fs.createWriteStream).to.have.been.calledWith(
        `${location}/${files[0]}`
      )
      expect(stream.pipeline).to.have.been.calledWith(readStream, writeStream)
    })

    it('should return an error if the file cannot be stored', async function() {
      stream.pipeline.yields(error)
      await expect(
        FSPersistorManager.promises.sendFile(location, files[0], files[1])
      ).to.eventually.be.rejectedWith(error)
    })
  })

  describe('sendStream', function() {
    it('should send the stream to LocalFileWriter', async function() {
      await FSPersistorManager.promises.sendStream(
        location,
        files[0],
        remoteStream
      )
      expect(LocalFileWriter.promises.writeStream).to.have.been.calledWith(
        remoteStream
      )
    })

    it('should delete the temporary file', async function() {
      await FSPersistorManager.promises.sendStream(
        location,
        files[0],
        remoteStream
      )
      expect(LocalFileWriter.promises.deleteFile).to.have.been.calledWith(
        tempFile
      )
    })

    it('should return the error from LocalFileWriter', async function() {
      LocalFileWriter.promises.writeStream.rejects(error)
      await expect(
        FSPersistorManager.promises.sendStream(location, files[0], remoteStream)
      ).to.eventually.be.rejectedWith(error)
    })

    it('should send the temporary file to the filestore', async function() {
      await FSPersistorManager.promises.sendStream(
        location,
        files[0],
        remoteStream
      )
      expect(fs.createReadStream).to.have.been.calledWith(tempFile)
    })
  })

  describe('getFileStream', function() {
    const filename = 'wombat/potato'
    const filteredFilename = 'wombat_potato'

    it('should use correct file location', async function() {
      await FSPersistorManager.promises.getFileStream(location, filename, {})
      expect(fs.open).to.have.been.calledWith(`${location}/${filteredFilename}`)
    })

    it('should pass the options to createReadStream', async function() {
      await FSPersistorManager.promises.getFileStream(location, filename, {
        start: 0,
        end: 8
      })
      expect(fs.createReadStream).to.have.been.calledWith(null, {
        start: 0,
        end: 8,
        fd
      })
    })

    it('should give a NotFoundError if the file does not exist', async function() {
      const err = new Error()
      err.code = 'ENOENT'
      fs.open.yields(err)

      await expect(
        FSPersistorManager.promises.getFileStream(location, filename, {})
      )
        .to.eventually.be.rejectedWith('file not found')
        .and.be.an.instanceOf(Errors.NotFoundError)
    })

    it('should wrap any other error', async function() {
      fs.open.yields(error)
      await expect(
        FSPersistorManager.promises.getFileStream(location, filename, {})
      )
        .to.eventually.be.rejectedWith('failed to open file for streaming')
        .and.be.an.instanceOf(Errors.ReadError)
        .and.have.property('cause', error)
    })
  })

  describe('getFileSize', function() {
    const filename = 'wombat/potato'
    const badFilename = 'neenaw.tex'
    const filteredFilename = 'wombat_potato'
    const size = 65536
    const noentError = new Error('not found')
    noentError.code = 'ENOENT'

    beforeEach(function() {
      fs.stat
        .yields(error)
        .withArgs(`${location}/${filteredFilename}`)
        .yields(null, { size })
        .withArgs(`${location}/${badFilename}`)
        .yields(noentError)
    })

    it('should return the file size', async function() {
      expect(
        await FSPersistorManager.promises.getFileSize(location, filename)
      ).to.equal(size)
    })

    it('should throw a NotFoundError if the file does not exist', async function() {
      await expect(
        FSPersistorManager.promises.getFileSize(location, badFilename)
      ).to.eventually.be.rejected.and.be.an.instanceOf(Errors.NotFoundError)
    })

    it('should wrap any other error', async function() {
      await expect(FSPersistorManager.promises.getFileSize(location, 'raccoon'))
        .to.eventually.be.rejected.and.be.an.instanceOf(Errors.ReadError)
        .and.have.property('cause', error)
    })
  })

  describe('copyFile', function() {
    it('Should open the source for reading', async function() {
      await FSPersistorManager.promises.copyFile(location, files[0], files[1])
      expect(fs.createReadStream).to.have.been.calledWith(
        `${location}/${files[0]}`
      )
    })

    it('Should open the target for writing', async function() {
      await FSPersistorManager.promises.copyFile(location, files[0], files[1])
      expect(fs.createWriteStream).to.have.been.calledWith(
        `${location}/${files[1]}`
      )
    })

    it('Should pipe the source to the target', async function() {
      await FSPersistorManager.promises.copyFile(location, files[0], files[1])
      expect(stream.pipeline).to.have.been.calledWith(readStream, writeStream)
    })
  })

  describe('deleteFile', function() {
    it('Should call unlink with correct options', async function() {
      await FSPersistorManager.promises.deleteFile(location, files[0])
      expect(fs.unlink).to.have.been.calledWith(`${location}/${files[0]}`)
    })

    it('Should propagate the error', async function() {
      fs.unlink.yields(error)
      await expect(
        FSPersistorManager.promises.deleteFile(location, files[0])
      ).to.eventually.be.rejectedWith(error)
    })
  })

  describe('deleteDirectory', function() {
    it('Should call rmdir(rimraf) with correct options', async function() {
      await FSPersistorManager.promises.deleteDirectory(location, files[0])
      expect(rimraf).to.have.been.calledWith(`${location}/${files[0]}`)
    })

    it('Should propagate the error', async function() {
      rimraf.yields(error)
      await expect(
        FSPersistorManager.promises.deleteDirectory(location, files[0])
      ).to.eventually.be.rejectedWith(error)
    })
  })

  describe('checkIfFileExists', function() {
    const filename = 'wombat'
    const badFilename = 'potato'
    const noentError = new Error('not found')
    noentError.code = 'ENOENT'

    beforeEach(function() {
      fs.stat
        .yields(error)
        .withArgs(`${location}/${filename}`)
        .yields(null, {})
        .withArgs(`${location}/${badFilename}`)
        .yields(noentError)
    })

    it('Should call stat with correct options', async function() {
      await FSPersistorManager.promises.checkIfFileExists(location, filename)
      expect(fs.stat).to.have.been.calledWith(`${location}/${filename}`)
    })

    it('Should return true for existing files', async function() {
      expect(
        await FSPersistorManager.promises.checkIfFileExists(location, filename)
      ).to.equal(true)
    })

    it('Should return false for non-existing files', async function() {
      expect(
        await FSPersistorManager.promises.checkIfFileExists(
          location,
          badFilename
        )
      ).to.equal(false)
    })

    it('should wrap the error if there is a problem', async function() {
      await expect(
        FSPersistorManager.promises.checkIfFileExists(location, 'llama')
      )
        .to.eventually.be.rejected.and.be.an.instanceOf(Errors.ReadError)
        .and.have.property('cause', error)
    })
  })

  describe('directorySize', function() {
    it('should wrap the error', async function() {
      fs.readdir.yields(error)
      await expect(
        FSPersistorManager.promises.directorySize(location, 'wombat')
      )
        .to.eventually.be.rejected.and.be.an.instanceOf(Errors.ReadError)
        .and.include({ cause: error })
        .and.have.property('info')
        .which.includes({ location, name: 'wombat' })
    })

    it('should sum directory files size', async function() {
      expect(
        await FSPersistorManager.promises.directorySize(location, 'wombat')
      ).to.equal(stat.size * files.length)
    })
  })
})
