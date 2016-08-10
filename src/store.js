const Immutable = require('seamless-immutable')

let userDataState = Immutable({})
let chanDataState = Immutable({})

const getUserData = (controller, userId) => {
  return new Promise((resolve, reject) => {
    controller.storage.users.get(userId, (err, userData) => err ? resolve() : resolve(userData))
  })
}

const saveUserData = (controller, userId, data) => {
  if (userDataState[userId]) {
    return Promise.reject(new Error('Saving in progress'))
  }
  userDataState = userDataState.set(userId, true)

  return getUserData(controller, userId)
  .then((userData) => {
    return new Promise((resolve, reject) => {
      const newUserData = Object.assign({}, userData, data, { id: userId })

      controller.storage.users.save(newUserData, (err) => {
        userDataState = userDataState.set(userId, false)
        return err ? reject(err) : resolve(newUserData)
      })
    })
  })
}

const getChanData = (controller, chanId) => {
  return new Promise((resolve, reject) => {
    controller.storage.channels.get(chanId, (err, chanData) => err ? resolve() : resolve(chanData))
  })
}

const saveChanData = (controller, chanId, data) => {
  if (chanDataState[chanId]) {
    return Promise.reject(new Error('Saving in progress'))
  }
  chanDataState = chanDataState.set(chanId, true)

  return getUserData(controller, chanId)
  .then((chanData) => {
    return new Promise((resolve, reject) => {
      const newChanData = Object.assign({}, chanData, data, { id: chanId })

      controller.storage.channels.save(newChanData, (err) => {
        chanDataState = chanDataState.set(chanId, false)
        return err ? reject(err) : resolve(newChanData)
      })
    })
  })
}

const curryFunc = function (func, p1, p2, p3) {
  const params = Array.prototype.slice.call(arguments, 1)
  return function (a1, a2, a3) {
    return func.apply(this, params.concat(Array.prototype.slice.call(arguments, 0)))
  }
}

module.exports = {
  getUserData,
  saveUserData,
  getChanData,
  saveChanData,
  curry: (controller) => {
    return {
      getUserData: curryFunc(getUserData, controller),
      saveUserData: curryFunc(saveUserData, controller),
      getChanData: curryFunc(getChanData, controller),
      saveChanData: curryFunc(saveChanData, controller)
    }
  }
}
