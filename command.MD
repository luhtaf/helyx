aku belum tau nama projectnya, kamu kasih nama ya, tapi gini aku mau bikin sebuah platform threat intel tapi saat ini fokus di vulnerability management lengkap menggunakan backend graphql dan database neo4j,
dia menyimpan semua cve, terus cve di update tiap hari
cve di pecah, jadi ada node cve, node produk, node vendor, kalo ada selain cve boleh banget, terus pake edge untuk bikin relasi

fitur andalannya disini
kita bisa scan server kita, 

jadi ada namanya aset, aset bisa tiered gitu, misal server fisik, ip berapa, diinstall apa misal hypervisor, terus ada vm apa aja, terus misal dalem vm ada docker ada container apa aja, misal ada kubernetes, keliatan ada kubernetes apa aja,
tiap vm ip berapa, tiap container ip berapa, gitu gitu, terus tiap tiapnya ada aplikasi apa aja, terus tiap aplikasi ada dependency apa aja, biar bisa dipetain ke node product
rencana saya akan scan pakai trivy rootfs /, all, terus output sbom, server kita akan menerima input sbom juga untuk inventory, tiap aset dihubungin pake edge juga, kalo ada ide lain selain trivy yang lebih masuk akal misal bikin scanner sendiri juga lebih oke, aku pengen di all level bisa kedeteksi

terus tadi kan bisa diliat tiered, bisa diliat list, per tipe juga, misal per apps, per jenis misal vm codingan, apps, vm, atau fisik, juga

setiap fetch cve, karena kita pake graphql, otomatis kan kita bisa tau ada cve baru apa engga gitu di produk inventory kita, pisah fitur admin dan user juga. Jadi tiap user pinya inventory masing masing, scanner per user juga oke, atau scanner nempel di user, tjakep bener, untuk scanner misal mau nerapin codingan kaya reverse shell

jangan lupa skill yang kita bahas, line dalam 1 file jangan kepanjangan biar kamu bisa baca codingannya tetepan, pake composable dan shared component, sebisa mungkin kalo bisa di reuse, backend jangan sampe WET, logic yang bisa dighabung digabung, jangan N+1 query, aku mau ini siap untuk production bahkan skala gede, performa efisien juga, yang masalah kalo nambah user tinggal nambah hardware atau node cloud gitu loh, nanti bila perlu kutest pake k6s, unit, integration, e2e, linter, trivy, di CI nya,

tapi annti aja dulu yang test itu


tambahan aku mau kamu bisa dapet list threat actor juga, bisa nampilin ttp by mitre juga, cari info enrich ioc juga, semua dalam bentuk graph db ya,
kalo bisa bayanganku adalah, misal di inventory kita klik klik yang mana aja, terus berubah jadi export to suricata rules, export to sigma rules, export to yara rules, gitu gitu, terus threat actor bisa keliatan ttpnya apa aja kan tadi bentuk mitre banget diagram ttpnya, terus tiap ttp ada penjelasan bisa di klik kalo dulu mirip di https://pan-unit42.github.io/playbook_viewer/ sekarang udah tutup sih, terus tiap klik ttp misal ada ioc atau rules berkaitan bisa disimpen,
berarti kalo bisa kamu cari sumber  ioc dan rules juga, riset dulu boleh
rules owasp boleh disimpenjuga misal untuk suricata

jadi aku ada konsep how to make good rules,
1. load geenral rules, general kaya bruteforce, sql injection, ddos, dll owasp juga
2. inventory your asset
3. inventory your cve based on asset
4. link ta to cve, jadi threat actor mana sering nyerang cve mana, karena tools ga selalu berkembang,
5. bisa mode beast atau exact, kalo exact cuma versi terdampak aja yang bisa, kalo beast, walau versi terdampak ga kena, selama produk kena dia bisa match juga
idenya daris itu platform ini

ohiya, kita bisa hunting juga, misal bisa export by threat actor juga, misal threat actor a, kita export jadi suricata, yara, atau sigma, atau openioc, atau ioc list biasa untuk hunting, ioc aku mau ga cuma low level, tapi sampe high level, kaya imphash, ssdeep, sdhash, port, cron, service name, scheduler, registry, command line command, dll dll,
atau bisa juga bikin "hunt" masukin ta, dan inventory kita sekaligus, bisa di superset, bisa di subset, bisa subset mana sambil kasih grafik subset dan supersetnya biar cakep banget, kalo bisa bikin dashboard juga kaya maltego dari semua data kita, bisa expand, dan berhubung udah graph pas expand graph makin gede, keren kan ide ku, bikin jadi beberapa batch aja gapapa karena proyek gede kan ini

harapanku bahkan si scanner bahakn bisa dijalanin di proxmox, esxi/vsphere dll, k3s k0s k8s, docker

untuk ui, aku gamau tampilannya kaya ai banget, aku mau ui keren seharga miliaran anggep aja, ux simple tapi helpful, dan apps tetep terkesan mahal, pokoknya aksi gas pokoke joget, ui/ux desainer miliaran inget ya, yang ga norak terlalu siber, tapi ga terlalu kekanakan juga

note: salah 1 sumber boleh pake otx, bikin .env sebisa mungkin

terus kalo perlu apa apa, aku punya dokcer, install disitu aja
