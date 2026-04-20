#!/bin/zsh
ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -i /Users/bingshuolingdianyuanhe/.ssh/qiyuan_lh_main_prod_01 ubuntu@124.222.54.198 'echo ok && id -un && uname -sr'
