// 插入群测试首页加载速度
const uuid = require('uuid')
const {ormModelPromise} = require('../../api/store/ormModel')

const groupCount = 1000

start()

async function start () {
  const ormModel = await ormModelPromise
  const psAry = []
  const groupAry = []
  for (let i = 0; i < groupCount; i++) {
    const group = {
      id: uuid(),
      name: `group_test_${i}`
    }
    groupAry.push(group)
  }
  const memberIdAry = ['cb2d7a47-f8ae-4aad-9d32-3e0d67bbc6a0', '33b947c5-9ede-4620-8136-b2c0eaf1d0d9',
    'e88c32d3-c9e1-4808-bb19-427c0edda4d1']
  const groupMemberAry = []
  for (let group of groupAry) {
    memberIdAry.forEach(ele => {
      groupMemberAry.push({
        gid: group.id,
        memberId: ele
      })
    })
  }
  psAry.concat([ormModel.groupChat.modelSequelized.bulkCreate(groupAry), ormModel.groupMember.modelSequelized.bulkCreate(groupMemberAry)])
  await Promise.all(psAry)
  console.log(`${groupCount} groups inserted`)
}
