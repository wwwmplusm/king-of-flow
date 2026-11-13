// Curated arrangements: different harmony, instrumentation, rhythm and density.
(() => {
  const scenes = [
    ['felt-morning','Утренний войлок','piano',58,48,[0,5,9,7],0,0],
    ['felt-night','Ночные страницы','piano',66,45,[0,3,7,5],1,0],
    ['felt-rain','После дождя','piano',72,50,[0,7,5,2],0,1],
    ['felt-library','Библиотека','piano',54,43,[0,5,3,7],1,0],
    ['nylon-sun','Солнечная комната','guitar',76,48,[0,5,7,0],0,1],
    ['nylon-coast','Береговая тропа','guitar',68,50,[0,3,5,7],1,0],
    ['nylon-letter','Письмо','guitar',82,45,[0,5,2,7],0,1],
    ['nylon-dusk','Сумеречный сад','guitar',62,47,[0,7,3,5],1,0],
    ['wood-moss','Мох','marimba',70,48,[0,5,7,2],0,0],
    ['wood-river','Речные камни','marimba',86,45,[0,3,5,7],1,1],
    ['wood-island','Остров','marimba',78,50,[0,7,5,0],0,1],
    ['wood-bamboo','Бамбук','marimba',64,43,[0,5,3,7],1,0],
    ['keys-tape','Магнитная лента','ep',74,45,[0,3,5,7],1,2],
    ['keys-train','Ночной поезд','ep',84,48,[0,5,2,7],0,2],
    ['keys-window','Окно во двор','ep',68,50,[0,7,3,5],1,1],
    ['keys-sunday','Воскресенье','ep',80,43,[0,5,7,0],0,2],
    ['pad-orbit','Орбита','pad',48,36,[0,5,3,7],1,0],
    ['pad-fog','Туманная долина','pad',52,38,[0,7,5,2],0,0],
    ['pad-polar','Полярный свет','pad',60,40,[0,3,7,5],1,0],
    ['pad-horizon','Дальний горизонт','pad',44,41,[0,5,7,0],0,0],
    ['bell-ice','Тонкий лёд','bell',62,48,[0,3,5,7],1,0],
    ['bell-stars','Звёздная карта','bell',56,50,[0,7,5,2],0,0],
    ['pluck-lines','Параллельные линии','pluck',92,45,[0,3,7,5],1,2],
    ['pluck-city','Спящий город','pluck',88,43,[0,5,7,2],0,2],
  ];
  for (const [id,name,voice,bpm,root,degrees,minor,groove] of scenes) {
    const pad = voice === 'pad';
    TRACKS.push({ id, name, category: 'Фокус', tags: ['Фон'], bpm, mod: 12,
      subtitle: `${({piano:'Мягкое пианино',guitar:'Нейлоновые струны',marimba:'Деревянная перкуссия',ep:'Электропиано',pad:'Медленные пэды',bell:'Редкие колокола',pluck:'Тихое арпеджио'})[voice]} · ${groove ? 'мягкий ритм' : 'без ударных'}`,
      level: 1.1, colors: minor ? ['#8290aa','#b4a4c4'] : ['#baa88c','#91ad9c'],
      setup(r) {
        r.s.keys = r.bus(.55, pad ? .65 : .4);
        r.s.bass = r.bus(.65,.12);
        r.s.drums = r.bus(.4,.12);
        r.s.pad = r.bus(.4,.6);
      },
      step(r,i,t) {
        const phrase = pad ? 128 : 64;
        const base = root + degrees[Math.floor(i / phrase) % degrees.length];
        const chord = [base,base+(minor?3:4),base+7,base+14];
        if (i % phrase === 0) I.pad(r,r.s.pad,chord,t,phrase*r.stepDur,
          {type:minor?'triangle':'sine', gain:pad?.025:.008, cutoff:pad?750:1100,a:4,rel:5,spread:4});
        if (!pad && i % 16 === 0) r.tone(r.s.bass,{f:mtof(base-12),t,gain:.035,a:.04,hold:8*r.stepDur,r:1});
        const spacing = voice === 'bell' ? 16 : voice === 'pluck' ? 3 : voice === 'guitar' ? 4 : 8;
        if (!pad && i % spacing === 0) {
          const note = chord[Math.floor(i/spacing)%4] + (voice==='bell'?12:0);
          const pan = Math.sin(i*.13)*.25;
          if (voice==='ep') I.ep(r,r.s.keys,note,t,.3,2,pan);
          else if (voice==='bell' || voice==='pluck') I[voice](r,r.s.keys,note,t,.025,pan);
          else I[voice](r,r.s.keys,note,t,.28,pan);
        }
        if (groove && i%16===0) I.kick(r,r.s.drums,t,.16);
        if (groove===2 && i%16===8) I.snare(r,r.s.drums,t,.045);
        if (groove && i%8===4) I.hat(r,r.s.drums,t,.009);
      }
    });
  }
})();
