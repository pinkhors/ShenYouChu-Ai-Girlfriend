package com.shenyouchu.core.persona;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PersonaServiceTest {

    @Test
    void missingCharacterIsReported() {
        CharacterMapper mapper = mock(CharacterMapper.class);
        when(mapper.selectOne(org.mockito.ArgumentMatchers.any())).thenReturn(null);
        PersonaService service = new PersonaService(mapper, new ObjectMapper());

        assertThatThrownBy(() -> service.systemPrompt(null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("角色不存在");
    }

    @Test
    void promptContainsPersonaFields() throws Exception {
        CharacterProfile profile = new CharacterProfile();
        setField(profile, "code", "shenyouchu");
        setField(profile, "displayName", "沈幼楚");
        setField(profile, "personaVersion", "v1");
        setField(profile, "personaConfig",
                "{\"age\":23,\"traits\":[\"温柔\",\"小傲娇\"],\"speechStyle\":\"口语化\",\"background\":\"插画师\"}");

        CharacterMapper mapper = mock(CharacterMapper.class);
        when(mapper.selectById(1L)).thenReturn(profile);
        PersonaService service = new PersonaService(mapper, new ObjectMapper());

        String prompt = service.systemPrompt(1L);
        assertThat(prompt).contains("沈幼楚", "23", "温柔", "口语化", "插画师");
        assertThat(prompt).contains("行为边界", "医疗", "银行卡", "心理援助", "色情");
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
