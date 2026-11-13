/**
 * Emojis automáticos en los subtítulos (como Submagic): cuando suena una palabra con un
 * emoji claro, aparece encima de la línea. Diccionario en español por raíz de palabra
 * (sin tildes), de lo más concreto a lo más general. Nada de emojis para palabras vacías.
 */
const EMOJIS: [RegExp, string][] = [
  // Dinero y negocio
  [/^(dinero|plata|pesos?|dolar|dolares|euros?|billete)/, '💰'],
  [/^(ganancia|ingreso|factur|vend[ie]|venta|cliente)/, '📈'],
  [/^(perdi|perdida|deuda|gast[oéea])/, '📉'],
  [/^(negocio|empresa|emprend|marca|oficina)/, '💼'],
  [/^(ahorr|invert|inversion|presupuesto|finanz)/, '🏦'],
  [/^(precio|cobr|pag[oa]|tarjeta|compra)/, '💳'],
  [/^(meta$|metas$|objetivo|resultado)/, '🎯'],
  [/^(exito|ganar|gane|logr|campeon|victoria)/, '🏆'],
  [/^(crec|escal|subir|subio)/, '🚀'],
  [/^(numero|dato|estadistic|porcentaje|metrica)/, '📊'],
  [/^(contrat|firm|acuerdo|trato)/, '🤝'],
  // Ideas y aprendizaje
  [/^(idea|truco|tip|secreto|clave)/, '💡'],
  [/^(aprend|estudi|curso|clase|escuela|libro|leer)/, '📚'],
  [/^(error|equivoc|fall[oaé])/, '❌'],
  [/^(correct|perfecto|listo|funciona)/, '✅'],
  [/^(problema|cuidado|peligro|ojo|alerta)/, '⚠️'],
  [/^(pregunta|duda)/, '❓'],
  [/^(pensar|pienso|mente|cerebro)/, '🧠'],
  [/^(lista$|pasos$|checklist)/, '📝'],
  // Tiempo
  [/^(tiempo|hora|minuto|rapido|tarde|reloj)/, '⏰'],
  [/^(semana|mes$|meses$|ano$|anos$|calendario|fecha)/, '📅'],
  // Emociones
  [/^(amor$|corazon|encanta)/, '❤️'],
  [/^(feliz|alegr|sonri|divert)/, '😄'],
  [/^(triste|llor|dolor)/, '😢'],
  [/^(miedo|asust|terror)/, '😱'],
  [/^(enoj|rabia|furia)/, '😤'],
  [/^(increible|wow|impresion|locura|loco)/, '🤯'],
  [/^(fuego|brutal|epico|top)/, '🔥'],
  [/^(gracias|agradec)/, '🙏'],
  [/^(fiesta|celebr)/, '🎉'],
  // Personas y cuerpo
  [/^(gym|gimnasio|entren|ejercicio|muscul|fuerza|pesas)/, '💪'],
  [/^(correr|corri|maraton)/, '🏃'],
  [/^(salud|medic|doctor|hospital)/, '🩺'],
  [/^(dormir|sueno|descans)/, '😴'],
  [/^(famili|hijo|hija|mama|papa)/, '👨‍👩‍👧'],
  [/^(amig|equipo|gente|comunidad)/, '👥'],
  // Comida
  [/^(comida|comer|hambre|almuerzo|cena|desayun)/, '🍽️'],
  [/^(hamburgues)/, '🍔'], [/^(pizza)/, '🍕'], [/^(cafe)/, '☕'], [/^(cerveza)/, '🍺'], [/^(pollo)/, '🍗'],
  [/^(dulce|postre|pastel|torta)/, '🍰'], [/^(fruta|manzana)/, '🍎'], [/^(agua$)/, '💧'],
  // Tecnología y redes
  [/^(celular|telefono|movil|app|aplicacion)/, '📱'],
  [/^(computador|portatil|laptop|software|program)/, '💻'],
  [/^(video|grab|camara|reel)/, '🎥'],
  [/^(foto|imagen)/, '📸'],
  [/^(instagram|tiktok|redes|seguidor|likes?|viral)/, '📲'],
  [/^(internet|web|online|pagina)/, '🌐'],
  [/^(robot|inteligencia$|ia$|automatic)/, '🤖'],
  [/^(correo|email|mensaje)/, '✉️'],
  // Lugares y cosas
  [/^(casa|hogar|departamento|apartamento)/, '🏠'],
  [/^(carro|auto|coche|manejar)/, '🚗'],
  [/^(viaj|avion|vuelo|vacacion)/, '✈️'],
  [/^(playa|mar$|sol$)/, '🏖️'],
  [/^(musica|cancion|cantar)/, '🎵'],
  [/^(regalo|gratis)/, '🎁'],
  [/^(ropa|moda|vestido|camisa)/, '👕'],
  [/^(belleza|maquillaje|piel)/, '💄'],
  [/^(perro|mascota)/, '🐶'], [/^(gato)/, '🐱'],
  [/^(mundo|pais|ciudad)/, '🌎'],
  // Cierre y acción
  [/^(link|enlace|bio)/, '🔗'],
  [/^(comenta|comentario)/, '💬'],
  [/^(sigue|seguir|suscrib)/, '➕'],
  [/^(compart)/, '📤'],
  [/^(guard[ae])/, '🔖'],
];

/** Las más comunes en inglés (para subtítulos traducidos). */
const EMOJIS_EN: [RegExp, string][] = [
  [/^(money|cash|dollars?)$/, '💰'], [/^(sales?|sell|selling|clients?|customers?|revenue|income)$/, '📈'],
  [/^(business|company|brand|office)$/, '💼'], [/^(budget|save|saving|invest|finances?)$/, '🏦'],
  [/^(goal|goals|results?)$/, '🎯'], [/^(success|win|winning|won)$/, '🏆'], [/^(grow|growth|growing)$/, '🚀'],
  [/^(idea|ideas|tip|tips|secret|key)$/, '💡'], [/^(learn|learning|course|study|book)$/, '📚'],
  [/^(mistake|mistakes|error|wrong|fail|failed)$/, '❌'], [/^(problem|careful|warning)$/, '⚠️'],
  [/^(time|hours?|minutes?|fast|quick)$/, '⏰'], [/^(love|heart)$/, '❤️'], [/^(happy|fun)$/, '😄'],
  [/^(amazing|crazy|incredible|insane)$/, '🤯'], [/^(fire|epic)$/, '🔥'], [/^(gym|workout|training|muscle|strength)$/, '💪'],
  [/^(food|eat|eating|hungry|lunch|dinner|breakfast)$/, '🍽️'], [/^(coffee)$/, '☕'], [/^(phone|app)$/, '📱'],
  [/^(computer|laptop|software)$/, '💻'], [/^(video|camera)$/, '🎥'], [/^(home|house)$/, '🏠'], [/^(car)$/, '🚗'],
  [/^(travel|trip|flight)$/, '✈️'], [/^(music|song)$/, '🎵'], [/^(free|gift)$/, '🎁'], [/^(link|bio)$/, '🔗'],
  [/^(comment|comments)$/, '💬'], [/^(follow|subscribe)$/, '➕'], [/^(share)$/, '📤'], [/^(save)$/, '🔖'],
];

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, '').trim();

/** Emoji de una palabra (o null si no tiene uno claro). */
export function emojiFor(word: string): string | null {
  const w = fold(word);
  if (w.length < 3) return null;
  for (const [re, e] of EMOJIS) if (re.test(w)) return e;
  for (const [re, e] of EMOJIS_EN) if (re.test(w)) return e;
  return null;
}

/**
 * Qué líneas de subtítulos llevan emoji: la primera palabra con emoji de cada línea, sin
 * repetir el mismo emoji seguido y con al menos `gapFrames` entre uno y otro (no satura).
 */
export function pickEmojis(lines: { text: string; startFrame: number }[], gapFrames: number): (string | null)[] {
  let lastFrame = -Infinity;
  let last = '';
  return lines.map((l) => {
    if (l.startFrame - lastFrame < gapFrames) return null;
    for (const word of l.text.split(/\s+/)) {
      const e = emojiFor(word);
      if (e && e !== last) { lastFrame = l.startFrame; last = e; return e; }
    }
    return null;
  });
}
