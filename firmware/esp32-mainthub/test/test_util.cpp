#include "../mh_util.h"
#include <assert.h>
int main(){
  char v[64];
  assert(mh_jget("{\"a\": \"x y\", \"b\":12.5,\"c\":true}","a",v,64) && !strcmp(v,"x y"));
  assert(mh_jget("{\"a\": \"x y\", \"b\":12.5,\"c\":true}","b",v,64) && !strcmp(v,"12.5"));
  assert(mh_jget("{\"a\": \"x y\", \"b\":12.5,\"c\":true}","c",v,64) && !strcmp(v,"true"));
  assert(!mh_jget("{\"a\":1}","zz",v,64));
  assert(mh_jget("{\"n\":\"say \\\"hi\\\" \\\\ ok\"}","n",v,64) && !strcmp(v,"say \"hi\" \\ ok"));
  assert(mh_jget("{\"n\":\"has \\\"key\\\" inside\",\"key\":\"real\"}","key",v,64) && !strcmp(v,"real"));   // "key" di dalam nilai bukan kunci
  char tiny[4]; assert(mh_jget("{\"a\":\"abcdefgh\"}","a",tiny,4) && !strcmp(tiny,"abc"));
  char e[40]; mh_jescape("a\"b\\c\nd",e,40); assert(!strcmp(e,"a\\\"b\\\\c d"));
  MhCfg c; memset(&c,0,sizeof c); c.mqPort=1883; mh_copy(c.asset,sizeof c.asset,"OLD");
  assert(mh_apply_provision(c,"{\"a\":1}")==-1);
  int n=mh_apply_provision(c,"{\"mh\":1,\"id\":\"esp-a1b2c3\",\"asset\":\"PMP-203\",\"plant\":\"P1\",\"key\":\"mhk_x.y\",\"tr\":\"mqtt\",\"bh\":\"192.168.1.50\",\"bp\":1883,\"bu\":\"rtu\",\"bw\":\"p\\\"w\",\"demo\":1,\"oil\":1,\"cur\":0,\"vib\":0}");
  assert(n==13 && !strcmp(c.devId,"esp-a1b2c3") && !strcmp(c.asset,"PMP-203") && c.tr==1 && !strcmp(c.mqHost,"192.168.1.50") && c.mqPort==1883 && !strcmp(c.mqPass,"p\"w") && c.demo==1 && c.sCur==0);
  n=mh_apply_provision(c,"{\"mh\":1,\"asset\":\"ZZ\"}"); assert(n==1 && !strcmp(c.asset,"ZZ") && !strcmp(c.devId,"esp-a1b2c3"));  // kunci yang tidak ada tidak mengubah apa pun
  puts("ok"); }
