const MagicCode = require('./MagicCode');
const Member = require('./Member');
const Org = require('./Org');
const crypto = require('crypto')
let MCodeManager = {

    _asyGetMagicCode:function () {
        return new Promise( (resolve,reject)=> {
            MagicCode.asyGetMagicCode().then( (result) =>{
                if(result){
                    this._orgMCode = result.orgMCode;
                    this._memberMCode = result.memberMCode;
                }
                resolve();
            });

        });

    },

    // setOrgMagicCode:function (topOrgMCode) {
    //     this._orgMCode = topOrgMCode;
    // },
    //
    // setMemberMagicCode:function (topMemberMCode) {
    //     this._memberMCode = topMemberMCode;
    // },

    asyGetMemberMagicCode:function () {
        return new Promise( (resolve,reject)=> {
            if(this._memberMCode && this._memberTime > Date.now()){
                resolve(this._memberMCode);
            }else{
                this._asyGetMagicCode().then(()=>{
                    resolve(this._memberMCode);
                })
            }
        });
    },
    asyGetOrgMagicCode:function () {
        return new Promise( (resolve,reject)=> {
            if(this._orgMCode && this._orgTime > Date.now()){
                resolve(this._orgMCode);
            }else{
                this._asyGetMagicCode().then(()=>{
                    resolve(this._orgMCode);
                })
            }
        });
    },
    _magicCode:function (params) {
        let s = "";
        params.forEach(function (p) {
            s+=p?p.toString():"";
        })
        //
        let algorithm =  crypto.createHash('md5');
        let hashValue = algorithm.update(s,"utf8").digest('hex');
        return hashValue;
    },
    /**
     * reset the member's mcode
     * @param memberId
     */
    resetSingleMemberMagicCode:function (memberId) {
        Member.asyGetMember(memberId).then((m)=>{
            this._memberTime = Date.now()
            if(m){
                let params = [m.name,m.pic];
                let code = this._magicCode(params);
                Member.setMCode(memberId,code).then(()=>{
                    this.resetMemberMagicCode();
                });
            }else{
                this.resetMemberMagicCode();
            }
        })
    },
    /**
     * reset the org's mcode
     * @param orgId
     */
    resetSingleOrgMagicCode:function (orgId) {
        Org.asyGetOrg(orgId).then((org) => {
            this._orgTime = Date.now()
            if(org){
                let params = [org.name];
                let code = this._magicCode(params);
                Org.setMCode(orgId,code).then(()=>{
                    this.resetOrgMagicCode();
                });
            }else{
                this.resetOrgMagicCode();
            }
        });
    },
    resetOrgMagicCode:function () {
        Org.asyGetAll().then( (orgs) =>{
            let params = [];
            console.log("==="+orgs);
            orgs.forEach(function (org) {
                params.push(org.mCode);
            });
            let code = this._magicCode(params);
            this._orgMCode = code;
            MagicCode.setOrgMagicCode(code);
        })
    },
    resetMemberMagicCode:function () {
        Member.asyGetAll().then((members)=>{
            let params = [];
            members.forEach(function (member) {
                params.push(member.mCode);
            });
            let code = this._magicCode(params);
            this._memberMCode = code;
            MagicCode.setMemberMagicCode(code);
        });
    }
}
module.exports = MCodeManager;
