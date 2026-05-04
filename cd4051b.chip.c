#include "wokwi-api.h"
#include <stdint.h>
#include <stdlib.h>

#define CHANNEL_COUNT 8

typedef struct {
  pin_t pin_com;
  pin_t pin_channel[CHANNEL_COUNT];
  pin_t pin_a;
  pin_t pin_b;
  pin_t pin_c;
  pin_t pin_inh;
  timer_t timer;
} chip_state_t;

static uint8_t selected_channel(chip_state_t *chip) {
  uint8_t channel = 0;
  if (pin_read(chip->pin_a)) {
    channel |= 0x01;
  }
  if (pin_read(chip->pin_b)) {
    channel |= 0x02;
  }
  if (pin_read(chip->pin_c)) {
    channel |= 0x04;
  }
  return channel;
}

static void update_output(void *user_data) {
  chip_state_t *chip = (chip_state_t *)user_data;

  if (pin_read(chip->pin_inh)) {
    pin_dac_write(chip->pin_com, 2.5f);
    return;
  }

  const uint8_t channel = selected_channel(chip);
  const float voltage = pin_adc_read(chip->pin_channel[channel]);
  pin_dac_write(chip->pin_com, voltage);
}

void chip_init(void) {
  chip_state_t *chip = (chip_state_t *)calloc(1, sizeof(chip_state_t));

  chip->pin_com = pin_init("COM", ANALOG);
  chip->pin_channel[0] = pin_init("C0", ANALOG);
  chip->pin_channel[1] = pin_init("C1", ANALOG);
  chip->pin_channel[2] = pin_init("C2", ANALOG);
  chip->pin_channel[3] = pin_init("C3", ANALOG);
  chip->pin_channel[4] = pin_init("C4", ANALOG);
  chip->pin_channel[5] = pin_init("C5", ANALOG);
  chip->pin_channel[6] = pin_init("C6", ANALOG);
  chip->pin_channel[7] = pin_init("C7", ANALOG);
  chip->pin_a = pin_init("A", INPUT_PULLDOWN);
  chip->pin_b = pin_init("B", INPUT_PULLDOWN);
  chip->pin_c = pin_init("C", INPUT_PULLDOWN);
  chip->pin_inh = pin_init("INH", INPUT_PULLDOWN);

  const timer_config_t timer_config = {
    .callback = update_output,
    .user_data = chip,
  };
  chip->timer = timer_init(&timer_config);
  timer_start(chip->timer, 250, true);

  update_output(chip);
}
