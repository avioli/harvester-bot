const Harvest = require('harvest')
const moment = require('moment')

const harvester = (email, password, subdomain = process.env.HARVEST_SUBDOMAIN) => {
  const harvest = new Harvest({
    subdomain,
    email,
    password
  })

  const getInfo = (args) => {
    return new Promise((resolve, reject) => {
      harvest.Account.get(args || {}, (err, info) => err ? reject(err) : resolve(info))
    })
  }

  const getProjects = (args) => {
    // TODO(evo): add filtering by client_id and/or updated_since
    // @see: http://help.getharvest.com/api/projects-api/projects/create-and-show-projects/#filtering-requests
    return new Promise((resolve, reject) => {
      harvest.Projects.list(args || {}, (err, projects) => err ? reject(err) : resolve(projects))
    })
    .then((projects) => projects.map((o) => o && o.project).filter((o) => o))
  }

  const createProject = (args) => {
    const { client_id, name, active = true } = args || {}

    if (!client_id || !name) {
      return Promise.reject(new Error('To create a project you have to provide at minimum client and name.'))
    }

    const newProject = {
      project: Object.assign({}, args, { active })
    }

    return new Promise((resolve, reject) => {
      harvest.Projects.create(newProject, (err, response) => err ? reject(err) : resolve(response))
    })
  }

  const getDaily = (args) => {
    return new Promise((resolve, reject) => {
      harvest.TimeTracking.daily(args || {}, (err, timers) => err ? reject(err) : resolve(timers))
    })
  }

  const getTimeEntriesByUser = (userId, fromDate, toDate, args) => {
    const newArgs = Object.assign({}, args, {
      user_id: userId,
      from: moment(fromDate).format('YYYYMMDD'),
      to: moment(toDate).format('YYYYMMDD')
    })

    return new Promise((resolve, reject) => {
      harvest.Reports.timeEntriesByUser(newArgs, (err, entries) => err ? reject(err) : resolve(entries))
    })
  }

  // TODO:
  //   - start/stop/toggle timers

  // const projectsList = promisify(harvest.Projects.list, harvest.Projects)
  // const projectsSource = Observable.fromPromise(projectsList({}))
  //   .flatMap((x) => x)
  //   .pluck('project')

  return {
    rawHarvest: harvest,
    getInfo,
    getProjects,
    createProject,
    getDaily,
    getTimeEntriesByUser
  }
}

module.exports = harvester
