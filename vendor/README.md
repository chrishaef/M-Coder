gerke-decoder (GPL-3.0)
========================

Dieses Verzeichnis enthält vorkompilierte JAR-Dateien von
https://github.com/fowlay/gerke-decoder

- gerke_decoder.jar
- iirj-1.1.jar
- commons-math3-3.6.1.jar

Lizenz: GNU General Public License v3.0
Copyright (C) 2020-2024 Rabbe Fogelholm

Zum Neu-Bauen aus Quellcode:
  git clone https://github.com/fowlay/gerke-decoder.git
  cd gerke-decoder && mvn package
  cp target/gerke_decoder-*.jar vendor/gerke_decoder.jar
