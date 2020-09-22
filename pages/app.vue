<template>
    <div>
        <Tabs type="card" style="margin: 20px">
<!--            <TabPane label="苹果">-->
<!--                <div style="text-align: center;font-size: 1em" >-->
<!--                    <div>-->
<!--                        <img src="/img/app2.png" style="width:40%;margin:100px;border-radius: 15px;margin-top: 100px"/>-->
<!--                    </div>-->
<!--                    <div>-->
<!--                        <i-button @click="clickIOS" type="primary" shape="circle" size="large" icon="ios-cloud-download-outline" style="width:50%;height: 60px;font-size: 1.3em;border-radius: 80px">下载LK</i-button>-->
<!--                    </div>-->
<!--                    <div style="margin-top: 30px;color:#2d8cf0">-->
<!--                        {{this.info}}-->
<!--                    </div>-->
<!--                </div>-->
<!--            </TabPane>-->
            <TabPane label="安卓">
                <div style="text-align: center;font-size: 1em" >
                <div>
                    <img src="/img/app2.png" style="width:40%;margin:100px;border-radius: 15px;margin-top: 100px"/>
                </div>
                <div>
                    <i-button @click="clickAndroid" type="primary" shape="circle" size="large" icon="ios-cloud-download-outline" style="width:50%;height: 60px;font-size: 1.3em;border-radius: 80px">下载LK</i-button>
                </div>
<!--                <div style="margin-top: 30px;color:#2d8cf0">-->
<!--                    {{this.info}}-->
<!--                </div>-->
            </div>
            </TabPane>
<!--            <TabPane label="当前网址">-->
<!--                <div style="text-align: center;margin-top: 50px">-->
<!--                    <div v-html='qrcode' style="">-->

<!--                    </div>-->
<!--                </div>-->
<!--            </TabPane>-->
        </Tabs>

    </div>
</template>

<script>
  const qr = require('qr-image')

  export default {
    name: "app",
    data() {
      return  {
        qrcode: qr.imageSync("http://192.144.200.234:3000/app", { type: 'svg',size:10,parse_url:true}),
        info:"请用您的iphone或ipad加载本网页或扫描页面上的二维码",
        url:"itms-services://?action=download-manifest&url=https://raw.githubusercontent.com/tracelessman/LK-M/master/ios/manifest.plist"
      }
    },
    methods: {
      clickIOS(){
        location.href = this.url
      },
      clickAndroid() {
        location.href = 'http://192.144.200.234:3000/public/android/LK.apk'
      }
    },
    mounted(){

    },
  }
</script>

<style scoped>

</style>
